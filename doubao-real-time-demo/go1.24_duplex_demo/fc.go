package main

// FunctionTool matches OpenAI's current function tool definition in the Responses API.
type FunctionTool struct {
	Type        string      `json:"type,omitempty"` // always "function"
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Parameters  *JSONSchema `json:"parameters,omitempty"` // nil means no arguments
	Strict      *bool       `json:"strict,omitempty"`
}

// JSONSchema models the subset of JSON Schema commonly used by OpenAI function tools.
type JSONSchema struct {
	Type        string `json:"type,omitempty"`
	Description string `json:"description,omitempty"`

	Properties           map[string]*JSONSchema `json:"properties,omitempty"`
	Required             []string               `json:"required,omitempty"`
	AdditionalProperties *bool                  `json:"additionalProperties,omitempty"`

	Items *JSONSchema `json:"items,omitempty"`

	Enum []string `json:"enum,omitempty"`

	MinLength *int     `json:"minLength,omitempty"`
	MaxLength *int     `json:"maxLength,omitempty"`
	Minimum   *float64 `json:"minimum,omitempty"`
	Maximum   *float64 `json:"maximum,omitempty"`

	AnyOf []*JSONSchema `json:"anyOf,omitempty"`
}
