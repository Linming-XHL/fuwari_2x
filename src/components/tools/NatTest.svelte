<script lang="ts">
import Icon from "@iconify/svelte";

let testing = false;
let result: { natType: string; publicIp: string; phase?: number } | null = null;
let error = "";
let iceCandidates: string[] = [];
let testPhase = 0;

const ICE_CONFIG: RTCConfiguration = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
	],
};

const PRIMARY_SERVER = "ws://87.83.110.226:8080";
const SECONDARY_SERVER = "ws://87.83.110.226:8081";

function isUdpSrflxCandidate(candidate: string): boolean {
	const c = candidate.toLowerCase();
	return c.includes(" udp ") && c.includes(" srflx ");
}

function runSingleTest(
	serverUrl: string,
	phase: number,
): Promise<{ ip: string; port: number; candidates: string[] }> {
	return new Promise((resolve, reject) => {
		let pc: RTCPeerConnection | null = null;
		let ws: WebSocket | null = null;
		const candidates: string[] = [];
		let resolved = false;

		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				pc?.close();
				ws?.close();
				reject(new Error("测试超时"));
			}
		}, 10000);

		try {
			pc = new RTCPeerConnection(ICE_CONFIG);
			pc.createDataChannel("nat-test");

			pc.onicecandidate = (event) => {
				if (event.candidate) {
					const candidateStr = event.candidate.candidate;
					console.log("[NAT] Phase " + phase + " ICE candidate:", candidateStr);

					if (isUdpSrflxCandidate(candidateStr)) {
						candidates.push(candidateStr);

						if (ws && ws.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify({ "ice-candidate": candidateStr }));
						}
					}
				}
			};

			ws = new WebSocket(serverUrl);

			ws.onopen = () => {
				console.log("[NAT] Phase " + phase + " connected to " + serverUrl);

				// 发送测试阶段
				ws?.send(JSON.stringify({ type: "test-phase", phase }));

				pc?.createOffer().then((offer) => {
					ws?.send(
						JSON.stringify({
							"user-agent": navigator.userAgent,
							sdp: offer.sdp,
						}),
					);
					pc?.setLocalDescription(offer);
				});
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				console.log("[NAT] Phase " + phase + " received:", data);

				if (data.sdp && pc) {
					pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
				} else if (data["ice-candidate"] && pc) {
					pc.addIceCandidate({
						candidate: data["ice-candidate"],
						sdpMLineIndex: 0,
					});
				} else if (data.nat_type && !resolved) {
					resolved = true;
					clearTimeout(timeout);

					const firstCandidate = candidates[0];
					const ip = data.public_ip || "未知";
					const port = firstCandidate
						? Number.parseInt(firstCandidate.split(" ")[5])
						: 0;

					pc.close();
					ws.close();

					resolve({ ip, port, candidates });
				} else if (data.error && !resolved) {
					resolved = true;
					clearTimeout(timeout);
					pc?.close();
					ws?.close();
					reject(new Error(data.error));
				}
			};

			ws.onerror = () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					pc?.close();
					reject(new Error("连接失败"));
				}
			};
		} catch (err) {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				pc?.close();
				reject(err);
			}
		}
	});
}

async function startTest() {
	testing = true;
	result = null;
	error = "";
	iceCandidates = [];
	testPhase = 1;

	try {
		// 第一次测试
		console.log("[NAT] 开始第一次测试...");
		const test1 = await runSingleTest(PRIMARY_SERVER, 1);
		iceCandidates = test1.candidates;

		console.log("[NAT] 第一次测试结果:", test1);

		// 第二次测试（从不同端口）
		testPhase = 2;
		console.log("[NAT] 开始第二次测试...");
		const test2 = await runSingleTest(SECONDARY_SERVER, 2);

		console.log("[NAT] 第二次测试结果:", test2);

		// 对比结果判断NAT类型
		let natType: string;

		if (test1.port === 0 || test2.port === 0) {
			natType = "Blocked";
		} else if (test1.port !== test2.port) {
			// 两次测试端口不同 = 对称NAT
			natType = "Symmetric";
		} else {
			// 端口相同，能从不同端口的服务器连接成功 = Full Cone
			natType = "Full Cone";
		}

		result = {
			natType,
			publicIp: test1.ip,
			phase: 2,
		};

		console.log("[NAT] 最终结果:", result);
	} catch (err) {
		console.error("[NAT] Error:", err);
		error = err instanceof Error ? err.message : "测试失败";
	} finally {
		testing = false;
		testPhase = 0;
	}
}

const natTypeDescriptions: Record<string, string> = {
	"Full Cone": "完全锥形NAT - 最适合P2P连接",
	"Restricted Cone": "受限锥形NAT - 较好的P2P兼容性",
	"Port Restricted Cone": "端口受限锥形NAT - 中等P2P兼容性",
	Symmetric: "对称型NAT - P2P连接困难",
	Blocked: "网络被阻止",
};

function getNatDescription(natType: string): string {
	return natTypeDescriptions[natType] || "未知类型";
}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2 mb-6">
		<Icon icon="material-symbols:network-check-rounded" class="text-[var(--primary)] w-7 h-7" />
		<h1 class="text-2xl font-bold text-75">NAT类型测试</h1>
	</div>

	<p class="text-sm text-50 leading-relaxed">
		检测您的网络NAT类型和公网IP地址，帮助判断P2P连接兼容性。测试需要约15-20秒。
	</p>

	<div class="flex justify-center">
		<button
			class="rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-bold text-black/80 disabled:opacity-60 transition-all"
			disabled={testing}
			on:click={startTest}
		>
			{#if testing}
				<span class="flex items-center gap-2">
					<Icon icon="svg-spinners:ring-resize" class="text-lg" />
					正在测试... (阶段 {testPhase}/2)
				</span>
			{:else}
				开始检测
			{/if}
		</button>
	</div>

	{#if error}
		<div class="rounded-xl border border-red-200/20 bg-red-500/10 p-4 text-red-200">
			<div class="flex items-center gap-2">
				<Icon icon="material-symbols:error-outline-rounded" />
				<span>{error}</span>
			</div>
		</div>
	{/if}

	{#if result}
		<div class="rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/10 p-6 space-y-4">
			<div class="text-center">
				<p class="text-sm text-50 mb-1">NAT类型</p>
				<p class="text-3xl font-bold text-[var(--primary)]">{result.natType}</p>
				<p class="text-sm text-50 mt-2">{getNatDescription(result.natType)}</p>
			</div>
			<div class="border-t border-white/10 pt-4 text-center">
				<p class="text-sm text-50 mb-1">公网IP</p>
				<p class="text-xl font-mono text-75">{result.publicIp}</p>
			</div>
		</div>
	{/if}

	{#if iceCandidates.length > 0 && !result}
		<div class="rounded-xl border border-white/10 p-4">
			<p class="text-sm text-50 mb-2">已收集到 {iceCandidates.length} 个ICE候选者</p>
			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#each iceCandidates as candidate}
					<p class="text-xs text-40 font-mono truncate">{candidate}</p>
				{/each}
			</div>
		</div>
	{/if}

	<div class="rounded-xl border border-white/10 p-4 text-sm text-50 space-y-2">
		<p class="font-bold text-75">NAT类型说明：</p>
		<ul class="list-disc list-inside space-y-1">
			<li><span class="text-[var(--primary)]">Full Cone</span> - 完全锥形，P2P最友好</li>
			<li><span class="text-[var(--primary)]">Restricted Cone</span> - 受限锥形，需要先发送数据</li>
			<li><span class="text-[var(--primary)]">Port Restricted Cone</span> - 端口受限，需要特定端口</li>
			<li><span class="text-red-300">Symmetric</span> - 对称型，P2P困难，需中继</li>
		</ul>
	</div>
</div>
