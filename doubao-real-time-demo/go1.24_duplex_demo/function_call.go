package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang/glog"
	"github.com/gorilla/websocket"
)

// ============== Processor + Provider 两段式架构 ==============

// ToolsCallInput 一次工具调用的入参（模型下发的原始 arguments JSON 字符串）
type ToolsCallInput struct {
	ToolName  string
	Arguments string
	ToolUseID string
}

// ArgBuildResult Processor.BuildArg 输出，供 Provider.ToolsCall 使用
type ArgBuildResult struct {
	Arguments map[string]any
}

type ToolProcessor interface {
	BuildArg(ctx context.Context, in ToolsCallInput) (*ArgBuildResult, error)
	PostProcess(ctx context.Context, builtArgs map[string]any, raw string) (string, error)
}

type ToolProvider interface {
	ToolsCall(ctx context.Context, in ToolsCallInput, built *ArgBuildResult) (string, error)
}

type mcpTool struct {
	toolName  string
	processor ToolProcessor
	client    ToolProvider
}

// ============== 工具注册 ==============

const ToolNameVolcSearch = "volc_search"
const ToolNameExit = "detect_exit_intent"

var (
	toolMap = map[string]*mcpTool{
		ToolNameVolcSearch: {
			toolName:  ToolNameVolcSearch,
			processor: &VolcSearchProcessor{},
			client:    &VolcSearchProvider{},
		},
		ToolNameExit: {
			toolName:  ToolNameExit,
			processor: &ExitIntentProcessor{},
			client:    &ExitIntentProvider{},
		},
	}

	fcOutputLock sync.Mutex
)

// ============== 下行 FC 处理：解析 + 执行 + 回传 ==============

// handleFunctionCallResponse 处理下行 response.function_call_arguments.done 事件，
// 遍历 items 并发执行各工具，收集所有结果后用一次 conversation.item.create 回传。
func handleFunctionCallResponse(ctx context.Context, conn *websocket.Conn, e *FunctionCallArgumentsDoneEvent) {
	if len(e.Items) == 0 {
		glog.Warningf("[FC] function_call_arguments.done with empty items")
		return
	}
	outputs := make([]ConversationItemDef, len(e.Items))
	var wg sync.WaitGroup
	for i := range e.Items {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			fc := e.Items[i]
			output := runMcpTool(ctx, &fc)
			outputs[i] = ConversationItemDef{
				Type:   "message",
				Role:   RoleTool,
				CallID: fc.CallID,
				Content: []ConversationContent{
					{Type: "input_text", Text: output},
				},
			}
		}()
	}
	wg.Wait()
	if err := sendFunctionCallOutputs(conn, outputs); err != nil {
		glog.Errorf("[FC] send function_call_output fail, err=%v", err)
	}
}

// runMcpTool 路由到对应 mcpTool，依次执行 BuildArg → ToolsCall → PostProcess。
func runMcpTool(ctx context.Context, fc *FunctionCallItem) string {
	start := time.Now()
	glog.Infof("[FC] start tool call, call_id=%s, name=%s, arguments=%s", fc.CallID, fc.Name, fc.Arguments)

	tool, ok := toolMap[fc.Name]
	if !ok || tool == nil || tool.processor == nil || tool.client == nil {
		glog.Errorf("[FC] tool not registered: %s", fc.Name)
		return fmt.Sprintf("%s工具未注册", fc.Name)
	}

	input := ToolsCallInput{
		ToolName:  fc.Name,
		Arguments: fc.Arguments,
		ToolUseID: fc.CallID,
	}

	built, err := tool.processor.BuildArg(ctx, input)
	if err != nil {
		glog.Errorf("[FC] BuildArg fail, name=%s, err=%v", fc.Name, err)
		return fmt.Sprintf("%s参数解析失败", fc.Name)
	}

	raw, err := tool.client.ToolsCall(ctx, input, built)
	if err != nil {
		glog.Errorf("[FC] ToolsCall fail, name=%s, err=%v", fc.Name, err)
		return fmt.Sprintf("%s工具调用失败", fc.Name)
	}

	final, err := tool.processor.PostProcess(ctx, built.Arguments, raw)
	if err != nil {
		glog.Errorf("[FC] PostProcess fail, name=%s, err=%v", fc.Name, err)
		final = raw
	}

	glog.Infof("[FC] finish tool call, call_id=%s, name=%s, costMs=%d", fc.CallID, fc.Name, time.Since(start).Milliseconds())
	return final
}

// sendFunctionCallOutputs 上行：conversation.item.create + items 数组。
// 每个 item 携带 call_id，content 为对应工具执行结果文本。
func sendFunctionCallOutputs(conn *websocket.Conn, items []ConversationItemDef) error {
	fcOutputLock.Lock()
	defer fcOutputLock.Unlock()

	evt := &ConversationItemsCreateEvent{
		Type:    TypeConversationItemCreate,
		EventID: newEventID(),
		Items:   items,
	}
	glog.Infof("[FC] function_call_output, items=%d", len(items))
	if err := sendEvent(conn, evt); err != nil {
		return fmt.Errorf("send function_call_output: %w", err)
	}
	return nil
}

// ============== ExitIntentProcessor / ExitIntentProvider ==============

type ExitIntentArgs struct {
	IsExit bool   `json:"is_exit"`
	Reason string `json:"reason"`
}

type ExitIntentProcessor struct{}

func (p *ExitIntentProcessor) BuildArg(_ context.Context, in ToolsCallInput) (*ArgBuildResult, error) {
	args := map[string]any{}
	if in.Arguments != "" {
		_ = json.Unmarshal([]byte(in.Arguments), &args)
	}
	return &ArgBuildResult{Arguments: args}, nil
}

func (p *ExitIntentProcessor) PostProcess(_ context.Context, builtArgs map[string]any, raw string) (string, error) {
	return raw, nil
}

type ExitIntentProvider struct{}

func (p *ExitIntentProvider) ToolsCall(_ context.Context, _ ToolsCallInput, built *ArgBuildResult) (string, error) {
	if built == nil {
		return "", fmt.Errorf("built arg is nil")
	}
	return "退出成功", nil
}

// ============== VolcSearchProcessor / VolcSearchProvider ==============

const (
	defaultSearchAPIType = "web"
	defaultSearchCount   = 10
	defaultSearchAPIURL  = "https://open.feedcoopapi.com/search_api/web_search"
)

// QueryField 兼容 string 与 []string 两种 query
type QueryField []string

func (q *QueryField) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*q = []string{single}
		return nil
	}
	var multi []string
	if err := json.Unmarshal(data, &multi); err == nil {
		*q = multi
		return nil
	}
	return fmt.Errorf("query should be string or []string")
}

type ArgQueryFlexible struct {
	Query QueryField `json:"query"`
}

type VolcSearchProcessor struct{}

func (p *VolcSearchProcessor) BuildArg(_ context.Context, in ToolsCallInput) (*ArgBuildResult, error) {
	arg := &ArgQueryFlexible{}
	if err := json.Unmarshal([]byte(in.Arguments), arg); err != nil {
		return nil, fmt.Errorf("unmarshal arg failed: %w, arg=%s", err, in.Arguments)
	}
	queries := make([]string, 0, len(arg.Query))
	for _, q := range arg.Query {
		if q != "" {
			queries = append(queries, q)
		}
	}
	if len(queries) == 0 {
		return nil, fmt.Errorf("parse arg fail: empty query, arg=%s", in.Arguments)
	}
	return &ArgBuildResult{
		Arguments: map[string]any{
			"query":   queries[0],
			"queries": queries,
		},
	}, nil
}

func (p *VolcSearchProcessor) PostProcess(_ context.Context, builtArgs map[string]any, raw string) (string, error) {
	var multi struct {
		Results []*SearchAPIResponse `json:"results"`
	}
	var responses []*SearchAPIResponse
	if err := json.Unmarshal([]byte(raw), &multi); err == nil && len(multi.Results) > 0 {
		responses = multi.Results
	} else {
		var wrapped struct {
			Result *SearchAPIResponse `json:"result"`
		}
		if err := json.Unmarshal([]byte(raw), &wrapped); err == nil && wrapped.Result != nil {
			responses = []*SearchAPIResponse{wrapped.Result}
		} else {
			var resp SearchAPIResponse
			if err2 := json.Unmarshal([]byte(raw), &resp); err2 != nil {
				return "", fmt.Errorf("unmarshal search result fail: %w", err2)
			}
			responses = []*SearchAPIResponse{&resp}
		}
	}

	var b strings.Builder
	b.WriteString(getTimeNow())

	idx := 0
	for _, resp := range responses {
		if resp == nil {
			continue
		}
		for _, item := range resp.Result.WebResults {
			text := item.Summary
			if text == "" {
				text = item.Snippet
			}
			if text == "" {
				text = item.Content
			}
			if text == "" {
				continue
			}
			idx++
			b.WriteString(fmt.Sprintf("摘要superscript:%d:\n", idx))
			b.WriteString(fmt.Sprintf("本文标题：%s\n本文内容：%s\n本文链接：%s\n网页发布时间：%s\n",
				item.Title, text, item.URL, item.PublishTime))
		}
	}
	if idx == 0 {
		return "", fmt.Errorf("empty search content")
	}
	return b.String(), nil
}

type VolcSearchProvider struct{}

// VolcSearchProvider is a Volcano Engine Search API example.
// Set volcSearchAPIKey in main.go before running if you want this tool to call the real search service.
func (p *VolcSearchProvider) ToolsCall(ctx context.Context, _ ToolsCallInput, built *ArgBuildResult) (string, error) {
	if built == nil {
		return "", fmt.Errorf("built arg is nil")
	}
	queries, _ := built.Arguments["queries"].([]string)
	if len(queries) == 0 {
		if q, ok := built.Arguments["query"].(string); ok && q != "" {
			queries = []string{q}
		}
	}
	if len(queries) == 0 {
		return "", fmt.Errorf("invalid query")
	}
	if volcSearchAPIKey == "" {
		return "", fmt.Errorf("volcSearchAPIKey is required for volc_search")
	}

	if len(queries) == 1 {
		resp, err := searchAPIKeyClient(ctx, volcSearchAPIKey, queries[0])
		if err != nil {
			return "", err
		}
		bs, err := json.Marshal(map[string]any{"result": resp})
		if err != nil {
			return "", fmt.Errorf("marshal response fail: %w", err)
		}
		return string(bs), nil
	}

	results := make([]*SearchAPIResponse, len(queries))
	errs := make([]error, len(queries))
	wg := sync.WaitGroup{}
	for i, q := range queries {
		i := i
		q := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := searchAPIKeyClient(ctx, volcSearchAPIKey, q)
			if err != nil {
				errs[i] = err
				glog.Errorf("[FC] volc search fail, query=%s, err=%v", q, err)
				return
			}
			results[i] = resp
		}()
	}
	wg.Wait()

	successResults := make([]*SearchAPIResponse, 0, len(results))
	for _, r := range results {
		if r != nil {
			successResults = append(successResults, r)
		}
	}
	if len(successResults) == 0 {
		return "", fmt.Errorf("all volc search fail: %v", errs)
	}

	bs, err := json.Marshal(map[string]any{"results": successResults})
	if err != nil {
		return "", fmt.Errorf("marshal response fail: %w", err)
	}
	return string(bs), nil
}

// ============== 火山搜索 HTTP 客户端 ==============

type SearchAPIRequest struct {
	Query       string          `json:"Query"`
	SearchType  string          `json:"SearchType"`
	Count       int             `json:"Count"`
	Filter      SearchAPIFilter `json:"Filter"`
	NeedSummary bool            `json:"NeedSummary"`
	TimeRange   string          `json:"TimeRange,omitempty"`
}

type SearchAPIFilter struct {
	NeedContent bool   `json:"NeedContent"`
	NeedURL     bool   `json:"NeedUrl"`
	Sites       string `json:"Sites,omitempty"`
}

type SearchAPIResponse struct {
	ResponseMetadata SearchAPIResponseMetadata `json:"ResponseMetadata"`
	Result           SearchAPIResult           `json:"Result"`
}

type SearchAPIResponseMetadata struct {
	RequestID string `json:"RequestId"`
	Action    string `json:"Action"`
	Version   string `json:"Version"`
	Service   string `json:"Service"`
	Region    string `json:"Region"`
}

type SearchAPIResult struct {
	ResultCount int64              `json:"ResultCount"`
	WebResults  []SearchAPIWebItem `json:"WebResults"`
	Usage       map[string]any     `json:"Usage"`
	Context     map[string]any     `json:"SearchContext"`
	TimeCost    int                `json:"TimeCost"`
	LogID       string             `json:"LogID"`
	Rag         *string            `json:"Rag"`
}

type SearchAPIWebItem struct {
	ID          string  `json:"Id"`
	SortID      int     `json:"SortId"`
	Title       string  `json:"Title"`
	SiteName    string  `json:"SiteName"`
	URL         string  `json:"Url"`
	Snippet     string  `json:"Snippet"`
	Summary     string  `json:"Summary"`
	Content     string  `json:"Content"`
	PublishTime string  `json:"PublishTime"`
	LogoURL     string  `json:"LogoUrl"`
	RankScore   float64 `json:"RankScore"`
}

func searchAPIKeyClient(ctx context.Context, apiKey, query string) (*SearchAPIResponse, error) {
	if apiKey == "" || query == "" {
		return nil, fmt.Errorf("invalid request params")
	}
	request := SearchAPIRequest{
		Query:      query,
		SearchType: defaultSearchAPIType,
		Count:      defaultSearchCount,
		Filter: SearchAPIFilter{
			NeedContent: false,
			NeedURL:     true,
		},
		NeedSummary: true,
	}
	reqBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal request failed: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, defaultSearchAPIURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("create request failed: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("search api status=%d, body=%s", resp.StatusCode, string(body))
	}
	var result SearchAPIResponse
	if err = json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response failed: %w", err)
	}
	return &result, nil
}

// ============== 工具函数 ==============

func getTimeNow() string {
	now := time.Now()
	week := []string{"日", "一", "二", "三", "四", "五", "六"}[now.Weekday()]
	return fmt.Sprintf("搜索时刻：%s星期%s\n", now.Format("2006年1月2日15时4分"), week)
}
