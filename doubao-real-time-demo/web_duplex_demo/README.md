# Seeduplex Web Demo

这个 demo 根据文档里的新版 `X-Api-Key` 接入方式实现：

- 浏览器输入 API Key，后端用 `X-Api-Key` 连接 `wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue`
- 创建 `session.create`，固定模型 `1.2.6.1`
- 页面可填写 `Dialog ID`；该字段对应服务内部的 dialog id，用于继承指定上下文。留空时创建新上下文，也可点击“生成 UUID”生成一个新的 UUID 字符串
- 语音输入：浏览器实时采集麦克风，转成 `pcm` / 16k / int16 / 单声道后，由客户端统一按 20ms 一包发送 `input_audio_buffer.append`；静音、麦克风关闭、麦克风启动失败等场景也保持每 20ms 一包上行，只是客户端事件面板会按聚合策略打印；`强制判停` 仅在模型未自动判停、迟迟不回复时使用，点击后会在待发送音频按 20ms 发完后发送 `input_audio_buffer.commit`，停止收音时也会提交一次
- FC Tools JSON：页面提供可编辑的 `tools` 数组，默认填入本地文件工具 schema，用户可以直接追加或修改工具定义；连接后继续修改会通过 `session.update.session.tools` 同步到上游
- 主动回复：页面开关控制 `session.create.extension.extra.enable_proactive_speak`
- 联网开关：开启后在 `session.create.extension.dialog.extra` 里传 `enable_volc_websearch=true`；`volc_websearch_type="web_custom_api"` 和 `"web_global_api"` 需要额外传 `volc_websearch_api_key`
- 唱歌开关：开启后在 `session.create.extension.dialog.extra` 里传 `enable_music=true`
- 地理位置：页面支持地图点选、浏览器定位或手动输入；地图点选和浏览器定位会尝试逆地理编码回填省市区；有值时会传到 `session.create.extension.dialog.location`
- 声音复刻：页面可选择音频文件或直接录音调用 V3 声音复刻训练接口，当前只支持预付费音色槽位和中文；也可手动保存已有预付费复刻音色 ID；复刻音色会写入浏览器 `localStorage`，刷新或重新打开后仍会出现在音色下拉框里，并支持查询状态和从本地缓存删除
- 收到 `response.function_call_arguments.done` 后执行本机文件工具，并用 `conversation.item.create` + `role=tool` + 原始 `call_id` 回传
- 返回的 `response.output_audio.delta` 默认使用 `ogg_opus`，浏览器优先用 MediaSource 流式追加 Ogg Opus，不支持时尝试 WebCodecs 做 Ogg demux + Opus 流式解码；两者都不支持时才退回整段收齐后播放
- 收到 `conversation.item.input_audio_transcription.started` 时立即打断当前播报
- 页面会聚合 ASR 识别文本和模型回复文本，按完整 QA 对展示
- 事件面板按一行一个事件展示，`↑` 表示客户端上行，`↓` 表示服务端下行，`•` 表示本地状态

## 启动

运行要求：Python 3.9+。这个 demo 只使用 Python 标准库，不需要安装第三方依赖。

在仓库根目录运行：

```bash
python3 web_duplex_demo/server.py --host 127.0.0.1 --port 8765
```

打开：

```text
http://127.0.0.1:8765
```

页面里填写火山语音控制台的 API Key，并选择音色、语速和音量。需要继承上下文时，在 `Dialog ID` 中填写之前的服务内部 dialog id；需要给客户创建新 id 时点击“生成 UUID”。声音复刻训练同样使用这个 API Key，请填写预付费音色槽位 ID。训练音频可以上传不超过 10MB 的 wav、mp3、ogg、m4a、aac 或 pcm 文件，也可以在页面里直接录音，页面录音会编码成 16k 单声道 wav 后提交；语种固定为中文，会传 `language=0`。本地文件 FC 默认查询当前用户桌面，桌面目录不存在时回退到启动目录；用户指定绝对目录时可查询对应目录的一层文件/目录。

连接成功后，页面会自动请求麦克风权限并开始实时收音；播报期间不会停止麦克风，客户端会把上行音频统一按 20ms 一包持续发送到服务端。关闭麦克风或麦克风启动失败时，客户端会继续每 20ms 发送静音帧保持上行。只有模型未自动判停、迟迟不回复时，才需要点击“强制判停”发送 `input_audio_buffer.commit`。点击“停止实时收音”会关闭麦克风并提交一次，之后可再点击“开始实时收音”继续。浏览器首次录音会请求麦克风权限。

`FC Tools JSON` 必须是 JSON array，会放入 `session.create.session.tools`，连接后修改会放入 `session.update.session.tools`。默认工具对齐服务端 `FunctionTool` 结构：`{"type":"function","name":"...","description":"...","parameters":{...}}`。如果用户粘贴了 `{"type":"function","function":{...}}` 结构，后端会自动展平成顶层 `name/description/parameters` 再发送。当前 demo 后端默认暴露 `list_local_directory`，只查询当前目录或指定目录下一层文件/目录数量和列表，不递归扩展。

## Function Calling

`list_local_directory` 会统计并列出默认目录、相对目录或用户指定绝对目录下一层的文件和目录，返回 `total_count`、`directory_count`、`file_count` 和 `entries`

安全限制：

- 未指定目录时使用页面配置的默认本地文件根目录
- 相对路径按默认根目录解析
- 用户明确指定绝对路径时，可查询该绝对目录
- 工具只列出一层，不递归展开子目录

## 说明

这个 demo 不依赖 `fastapi`、`aiohttp` 或 `websockets`。后端用 Python 标准库实现本地 HTTP/SSE 服务和上游 WSS 文本帧客户端，便于直接在现有 demo 环境运行。

如果 Python 的证书信任库无法识别本机代理证书，后端会在标准 TLS 校验失败后降级为跳过证书校验，并在页面事件里输出 warning。生产环境不要这样处理，应把代理/根证书正确安装到 Python trust store。
