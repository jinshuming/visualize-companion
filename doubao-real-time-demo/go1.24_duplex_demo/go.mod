module RealtimeDuplexDialog

go 1.24

replace github.com/apache/thrift => github.com/apache/thrift v0.13.0

require (
	github.com/BurntSushi/toml v1.5.0
	github.com/golang/glog v1.2.5
	github.com/google/uuid v1.6.0
	github.com/gordonklaus/portaudio v0.0.0-20250206071425-98a94950218b
	github.com/gorilla/websocket v1.5.3
	layeh.com/gopus v0.0.0-20210501142526-1ee02d434e32
)

require github.com/google/go-cmp v0.7.0 // indirect
