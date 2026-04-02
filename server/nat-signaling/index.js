import { WebSocket, WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const SECOND_PORT = Number.parseInt(process.env.SECOND_PORT || "8081");

// 存储连接信息
const clients = new Map();

// 主WebSocket服务器
const wss = new WebSocketServer({ port: PORT });

// 第二个WebSocket服务器（不同端口，用于测试Full Cone）
const wss2 = new WebSocketServer({ port: SECOND_PORT });

console.log("[NAT] 主信令服务器启动在端口 " + PORT);
console.log("[NAT] 辅助测试服务器启动在端口 " + SECOND_PORT);

// 处理主连接
wss.on("connection", (ws, req) => {
	handleConnection(ws, req, "primary");
});

// 处理辅助连接（用于第二次测试）
wss2.on("connection", (ws, req) => {
	handleConnection(ws, req, "secondary");
});

function handleConnection(ws, req, serverType) {
	const clientId = generateId();
	const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

	console.log(
		"[NAT] 新" + serverType + "连接: " + clientId + " 来自 " + clientIp,
	);

	const client = {
		id: clientId,
		ws: ws,
		ip: clientIp,
		iceCandidates: [],
		sdp: null,
		userAgent: null,
		serverType: serverType,
		testPhase: 1,
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
}

// 存储客户端的两次测试结果
const clientTestResults = new Map();

function handleMessage(client, message) {
	const keys = Object.keys(message);
	console.log("[NAT] 收到消息类型: " + keys.join(", "));

	// 处理测试阶段标记
	if (message.type === "test-phase") {
		client.testPhase = message.phase;
		console.log("[NAT] 测试阶段: " + message.phase);
		return;
	}

	// 处理SDP offer
	if (message.sdp) {
		client.sdp = message.sdp;
		client.userAgent = message["user-agent"];

		console.log("[NAT] 收到SDP Offer，阶段 " + client.testPhase);

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
	let answer = offerSdp;
	answer = answer.replace(/a=setup:actpass/g, "a=setup:active");
	answer = answer.replace(/a=setup:passive/g, "a=setup:active");
	answer = answer.replace(
		/o=- \d+ \d+ IN IP4/,
		"o=- " + Date.now() + " " + Date.now() + " IN IP4",
	);
	answer = answer.replace(/a=ice-lite/g, "");
	return answer;
}

function generateServerCandidate(clientInfo) {
	return (
		"candidate:1 1 udp 2130706431 0.0.0.0 12345 typ srflx raddr " +
		clientInfo.ip +
		" rport " +
		clientInfo.port
	);
}

function analyzeAndSendResult(client) {
	const candidates = client.iceCandidates;
	const phase = client.testPhase;
	const clientId = client.id.replace(/[^a-zA-Z0-9]/g, "");

	console.log(
		"[NAT] 分析阶段 " + phase + " 的 " + candidates.length + " 个候选者...",
	);

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

	const publicIp = srflxCandidates[0].ip;
	const publicPort = srflxCandidates[0].port;

	// 存储测试结果
	if (!clientTestResults.has(clientIp)) {
		clientTestResults.set(clientIp, []);
	}
	const results = clientTestResults.get(clientIp);
	results.push({ phase, ip: publicIp, port: publicPort });

	console.log("[NAT] 阶段 " + phase + " 公网: " + publicIp + ":" + publicPort);

	if (phase === 1) {
		// 第一次测试，返回结果并提示进行第二次测试
		client.ws.send(
			JSON.stringify({
				nat_type: "Testing",
				public_ip: publicIp,
				message: "第一次测试完成，正在进行第二次测试...",
				phase: 1,
				next_test_port: SECOND_PORT,
			}),
		);
	} else {
		// 第二次测试，对比结果
		const phase1Result = results.find((r) => r.phase === 1);
		const phase2Result = results.find((r) => r.phase === 2);

		let natType;

		if (!phase1Result || !phase2Result) {
			natType = "Unknown";
		} else if (phase1Result.port !== phase2Result.port) {
			// 两次测试端口不同 = 对称NAT
			natType = "Symmetric";
		} else if (phase1Result.port === phase2Result.port) {
			// 端口相同，检查是否能从不同端口连接
			// 如果能从辅助服务器（不同端口）连接成功，说明是Full Cone
			natType = "Full Cone";
		} else {
			natType = "Restricted Cone";
		}

		const result = {
			nat_type: natType,
			public_ip: publicIp,
			phase1_port: phase1Result?.port,
			phase2_port: phase2Result?.port,
		};

		console.log("[NAT] 最终结果: " + JSON.stringify(result));
		client.ws.send(JSON.stringify(result));

		// 清理测试结果
		clientTestResults.delete(clientIp);
	}
}

function generateId() {
	return Math.random().toString(36).substring(2, 10);
}

// 优雅关闭
process.on("SIGINT", () => {
	console.log("\n[NAT] 正在关闭服务器...");
	wss.close(() => {
		wss2.close(() => {
			console.log("[NAT] 服务器已关闭");
			process.exit(0);
		});
	});
});
