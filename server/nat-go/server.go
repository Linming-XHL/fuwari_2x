package main

import (
	"log"
	"net/http"
	"strings"
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

type Result struct {
	NATType  string `json:"nat_type"`
	PublicIP string `json:"public_ip"`
}

func main() {
	http.Handle("/", http.FileServer(http.Dir("./")))
	http.HandleFunc("/ws", wsHandler)

	log.Println("Server running at :8080")
	http.ListenAndServe(":8080", nil)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, _ := upgrader.Upgrade(w, r, nil)

	pc, _ := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun1.l.google.com:19302"}},
		},
	})

	var publicIP string
	var ports = make(map[string]bool)

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		conn.WriteJSON(map[string]string{
			"ice-candidate": c.ToJSON().Candidate,
		})
	})

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Println("ICE state:", state.String())
	})

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {

		dc.OnOpen(func() {
			log.Println("DataChannel open")

			// === 延迟后分析 NAT ===
			go func() {
				time.Sleep(3 * time.Second)

				natType := analyze(publicIP, ports)

				result := Result{
					NATType:  natType,
					PublicIP: publicIP,
				}

				conn.WriteJSON(result)
			}()
		})

		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			text := string(msg.Data)

			// 收到客户端回包
			if text == "pong" {
				log.Println("收到 pong")
			}
		})
	})

	for {
		var msg Msg
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}

		if msg.SDP != "" {
			pc.SetRemoteDescription(webrtc.SessionDescription{
				Type: webrtc.SDPTypeOffer,
				SDP:  msg.SDP,
			})

			answer, _ := pc.CreateAnswer(nil)
			pc.SetLocalDescription(answer)

			conn.WriteJSON(map[string]string{
				"sdp": answer.SDP,
			})
		}

		if msg.ICECandidate != "" {
			pc.AddICECandidate(webrtc.ICECandidateInit{
				Candidate: msg.ICECandidate,
			})

			// === 解析 srflx ===
			if strings.Contains(msg.ICECandidate, "srflx") {
				parts := strings.Split(msg.ICECandidate, " ")
				ip := parts[4]
				port := parts[5]

				publicIP = ip
				ports[port] = true
			}
		}
	}
}

func analyze(ip string, ports map[string]bool) string {
	if ip == "" {
		return "Blocked"
	}

	if len(ports) > 1 {
		return "Symmetric NAT"
	}

	return "Cone NAT (Full / Restricted / Port Restricted)"
}