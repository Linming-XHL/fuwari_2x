package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Msg struct {
	SDP          string `json:"sdp,omitempty"`
	ICECandidate string `json:"ice-candidate,omitempty"`
}

type Session struct {
	ws       *websocket.Conn
	pc       *webrtc.PeerConnection
	publicIP string
	ports    map[string]bool
	mu       sync.Mutex
}

func main() {
	http.HandleFunc("/ws", wsHandler)
	log.Println("NAT检测服务器启动在 :9000")
	http.ListenAndServe(":9000", nil)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket升级失败:", err)
		return
	}
	defer ws.Close()

	session := &Session{
		ws:    ws,
		ports: make(map[string]bool),
	}

	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	})
	if err != nil {
		log.Println("创建PeerConnection失败:", err)
		return
	}
	session.pc = pc
	defer pc.Close()

	// 接收DataChannel
	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		log.Println("收到DataChannel:", dc.Label())

		dc.OnOpen(func() {
			log.Println("DataChannel已打开 - 连接成功")

			// 连接成功，等待1秒后分析结果
			go func() {
				time.Sleep(1 * time.Second)
				session.analyze()
			}()
		})

		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			log.Println("收到消息:", string(msg.Data))
		})
	})

	// ICE候选者
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		ws.WriteJSON(map[string]string{
			"ice-candidate": c.ToJSON().Candidate,
		})
	})

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Println("ICE状态:", state.String())

		// 连接失败
		if state == webrtc.ICEConnectionStateFailed {
			session.sendResult("Blocked", "")
		}
	})

	// 消息循环
	for {
		var msg Msg
		if err := ws.ReadJSON(&msg); err != nil {
			log.Println("读取消息失败:", err)
			break
		}

		if msg.SDP != "" {
			session.handleSDP(msg.SDP)
		}

		if msg.ICECandidate != "" {
			session.handleICE(msg.ICECandidate)
		}
	}
}

func (s *Session) handleSDP(sdp string) {
	log.Println("收到SDP Offer")

	s.pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  sdp,
	})

	answer, _ := s.pc.CreateAnswer(nil)
	s.pc.SetLocalDescription(answer)

	s.ws.WriteJSON(map[string]string{"sdp": answer.SDP})
	log.Println("已发送SDP Answer")
}

func (s *Session) handleICE(candidate string) {
	s.pc.AddICECandidate(webrtc.ICECandidateInit{
		Candidate: candidate,
	})

	// 解析srflx
	if strings.Contains(candidate, "srflx") && strings.Contains(candidate, "udp") {
		parts := strings.Split(candidate, " ")
		if len(parts) >= 6 {
			ip := parts[4]
			port := parts[5]

			if !strings.Contains(ip, ":") {
				s.mu.Lock()
				s.publicIP = ip
				s.ports[port] = true
				s.mu.Unlock()
				log.Printf("记录: IP=%s Port=%s\n", ip, port)
			}
		}
	}
}

func (s *Session) analyze() {
	s.mu.Lock()
	ip := s.publicIP
	portCount := len(s.ports)
	s.mu.Unlock()

	log.Printf("分析: IP=%s 端口数=%d\n", ip, portCount)

	if ip == "" {
		s.sendResult("Blocked", "")
		return
	}

	var natType string

	if portCount > 1 {
		// 多个端口 = 对称型
		natType = "Symmetric"
	} else {
		// 单个端口 + 连接成功 = Full Cone
		// (参考CheckMyNat的逻辑)
		natType = "Full Cone"
	}

	s.sendResult(natType, ip)
}

func (s *Session) sendResult(natType, ip string) {
	result := map[string]string{
		"nat_type":  natType,
		"public_ip": ip,
	}

	data, _ := json.Marshal(result)
	log.Println("发送结果:", string(data))

	s.ws.WriteJSON(result)
}
