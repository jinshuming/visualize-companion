package main

import (
	"fmt"
	"github.com/BurntSushi/toml"
)

type DemoConfig struct {
	Auth     AuthConfig     `toml:"auth"`
	Search   SearchConfig   `toml:"search"`
	Session  SessionOptions `toml:"session"`
	Endpoint EndpointConfig `toml:"endpoint"`
}

type AuthConfig struct {
	APIKey string `toml:"api_key"`
}

type SearchConfig struct {
	APIKey string `toml:"api_key"`
}

type SessionOptions struct {
	Model        string `toml:"model"`
	Instructions string `toml:"instructions"`
	Speaker      string `toml:"speaker"`
	ASRFormat    string `toml:"asr_format"`
	TTSFormat    string `toml:"tts_format"`
}

type EndpointConfig struct {
	URL string `toml:"url"`
}

func loadConfig(path string) error {
	var cfg DemoConfig
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return fmt.Errorf("decode %s: %w", path, err)
	}

	if cfg.Auth.APIKey != "" {
		apikey = cfg.Auth.APIKey
	}
	if cfg.Search.APIKey != "" {
		volcSearchAPIKey = cfg.Search.APIKey
	}
	if cfg.Session.Model != "" {
		model = cfg.Session.Model
	}
	if cfg.Session.Instructions != "" {
		systemPrompt = cfg.Session.Instructions
	}
	if cfg.Session.Speaker != "" {
		speaker = cfg.Session.Speaker
	}
	if cfg.Session.ASRFormat != "" {
		asrFormat = cfg.Session.ASRFormat
	}
	if cfg.Session.TTSFormat != "" {
		ttsFormat = cfg.Session.TTSFormat
	}

	return nil
}
