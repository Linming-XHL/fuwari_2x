import { WebSocket, WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

// STUN服务器
const STUN_SERVER = "stun:stun.l.google.com:19302";

// 存储连接信息
const clients = new Map();

// 创建WebSocket服务器
const wss = new WebSocketServer({ port: PORT });

console.log("[NAT] 信令服务器启动在端口 " + PORT);

wss.on("connection", (ws, req) => {
	const clientId = generateId();
	const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

	console.log("[NAT] 新连接: " + clientId + " 来自 " + clientIp);

	const client = {
		id: clientId,
		ws: ws,
		ip: clientIp,
		iceCandidates: [],
		sdp: null,
		userAgent: null,
	};

	clients.set(clientId, client);

	ws.on("message", (data) => {
		try {
			const message = JSON.parse(data.toString());
			handleMessage(client, message);
		} catch (error) {
			console.error("[NAT] 解析消息失败:", error);
			ws.send(JSON.stringify({ error: "消息格式错误" }));
		}
	});

	ws.on("close", () => {
		console.log("[NAT] 连接关闭: " + clientId);
		clients.delete(clientId);
	});

	ws.on("error", (error) => {
		console.error("[NAT] 连接错误: " + clientId, error);
		clients.delete(clientId);
	});
});

function handleMessage(client, message) {
	const keys = Object.keys(message);
	console.log("[NAT] 收到消息类型: " + keys.join(", "));

	// 处理SDP offer
	if (message.sdp) {
		client.sdp = message.sdp;
		client.userAgent = message["user-agent"];

		console.log("[NAT] 收到SDP Offer");

		// 生成SDP Answer
		const answer = generateSdpAnswer(message.sdp);
		client.ws.send(JSON.stringify({ sdp: answer }));
		console.log("[NAT] 已发送SDP Answer");

		// 等待一段时间后分析结果
		setTimeout(() => {
			analyzeAndSendResult(client);
		}, 3000);
	}

	// 处理ICE候选者
	if (message["ice-candidate"]) {
		const candidate = message["ice-candidate"];
		const candidateInfo = parseIceCandidate(candidate);

		client.iceCandidates.push(candidateInfo);
		console.log(
			"[NAT] 收到ICE候选者: " +
				candidateInfo.type +
				" " +
				candidateInfo.ip +
				":" +
				candidateInfo.port,
		);

		// 发送一个服务器端的候选者回去（模拟）
		const serverCandidate = generateServerCandidate(candidateInfo);
		client.ws.send(JSON.stringify({ "ice-candidate": serverCandidate }));
	}
}

function parseIceCandidate(candidate) {
	const parts = candidate.split(" ");
	// 格式: candidate:foundation component protocol priority ip port typ type ...
	const typeIndex = parts.indexOf("typ");
	return {
		foundation: parts[0]?.split(":")[1],
		component: parts[1],
		protocol: parts[2],
		priority: parts[3],
		ip: parts[4],
		port: Number.parseInt(parts[5]),
		type: typeIndex >= 0 ? parts[typeIndex + 1] : "unknown",
		raddr: parts[parts.indexOf("raddr") + 1],
		rport: parts[parts.indexOf("rport") + 1],
	};
}

function generateSdpAnswer(offerSdp) {
	// 修改offer生成answer
	// 关键修改: setup属性必须是active或passive
	let answer = offerSdp;

	// 修改setup属性
	answer = answer.replace(/a=setup:actpass/g, "a=setup:active");
	answer = answer.replace(/a=setup:passive/g, "a=setup:active");

	// 修改o=行（session origin）
	answer = answer.replace(
		/o=- \d+ \d+ IN IP4/,
		"o=- " + Date.now() + " " + Date.now() + " IN IP4",
	);

	// 修改role
	answer = answer.replace(/a=ice-lite/g, "");

	return answer;
}

function generateServerCandidate(clientInfo) {
	// 生成一个模拟的服务器端候选者
	// 这会触发客户端建立连接
	return (
		"candidate:1 1 udp 2130706431 0.0.0.0 12345 typ srflx raddr " +
		clientInfo.ip +
		" rport " +
		clientInfo.port
	);
}

function analyzeAndSendResult(client) {
	const candidates = client.iceCandidates;

	console.log("[NAT] 分析 " + candidates.length + " 个候选者...");

	// 提取srflx候选者
	const srflxCandidates = candidates.filter((c) => c.type === "srflx");

	if (srflxCandidates.length === 0) {
		client.ws.send(
			JSON.stringify({
				nat_type: "Blocked",
				public_ip: "未知",
			}),
		);
		return;
	}

	// 获取公网IP
	const publicIp = srflxCandidates[0].ip;
	const publicPort = srflxCandidates[0].port;

	// 检查端口集合
	const uniquePorts = new Set(srflxCandidates.map((c) => c.port));
	const uniqueIps = new Set(srflxCandidates.map((c) => c.ip));

	console.log("[NAT] 公网IP: " + publicIp);
	console.log("[NAT] 公网端口: " + publicPort);
	console.log("[NAT] 不同端口数: " + uniquePorts.size);
	console.log("[NAT] 不同IP数: " + uniqueIps.size);

	let natType;

	if (srflxCandidates.length === 1) {
		// 只有一个srflx候选者
		// 无法完全确定，返回Restricted Cone（最常见）
		natType = "Restricted Cone";
	} else if (uniquePorts.size > 1) {
		// 多个不同端口 = 对称NAT
		natType = "Symmetric";
	} else {
		// 端口相同
		natType = "Port Restricted Cone";
	}

	const result = {
		nat_type: natType,
		public_ip: publicIp,
	};

	console.log("[NAT] 发送结果: " + JSON.stringify(result));
	client.ws.send(JSON.stringify(result));
}

function generateId() {
	return Math.random().toString(36).substring(2, 10);
}

// 优雅关闭
process.on("SIGINT", () => {
	console.log("\n[NAT] 正在关闭服务器...");
	wss.close(() => {
		console.log("[NAT] 服务器已关闭");
		process.exit(0);
	});
});
