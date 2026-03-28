<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "@iconify/svelte";
	import {
		changeEmail,
		deleteAccount,
		getCurrentUserAvatar,
		getSession,
		getTotpStatus,
		logout,
		setupTotp,
		updateProfile,
		uploadAvatar,
		verifyEmailChange,
		verifyTotp,
	} from "@/forum/api/auth";
	import { forumAuth } from "@/forum/stores/auth";
	import type { ForumUser } from "@/forum/types/user";
	import { compressAvatarImage } from "@/forum/utils/image-compression";

	let user: ForumUser | null = null;
	let loading = true;
	let status = "";
	let savingProfile = false;
	let changingEmail = false;
	let settingTotp = false;
	let deletingAccount = false;

	let username = "";
	let displayName = "";
	let avatarUrl = "";
	let emailNotifications = true;

	let emailNew = "";
	let emailTotp = "";

	let totpSecret = "";
	let totpUri = "";
	let totpCode = "";

	let deletePassword = "";
	let deleteTotp = "";

	async function copyAvatarUrl() {
		if (!avatarUrl) {
			status = "当前没有可复制的头像 URL。";
			return;
		}
		try {
			await navigator.clipboard.writeText(avatarUrl);
			status = "头像 URL 已复制。";
		} catch {
			status = "复制失败，请手动复制。";
		}
	}

	function isAdminUser(nextUser: ForumUser | null) {
		return nextUser?.role === "admin";
	}

	function applyUser(nextUser: ForumUser | null) {
		user = nextUser;
		username = nextUser?.username || "";
		displayName = nextUser?.displayName || "";
		avatarUrl = nextUser?.avatarUrl || "";
		emailNotifications = nextUser?.emailNotifications ?? true;
	}

	function resolveSecurityStatus(nextUser: ForumUser | null) {
		if (!nextUser) {
			return "未登录";
		}
		const parts: string[] = [];
		if (nextUser.verified !== undefined) {
			parts.push(nextUser.verified ? "邮箱已验证" : "邮箱未验证");
		}
		parts.push(nextUser.totpEnabled === undefined ? "2FA 状态未知" : nextUser.totpEnabled ? "2FA 已启用" : "2FA 未启用");
		return parts.join(" · ");
	}

	async function refreshSession(statusMessage?: string) {
		const session = await getSession();
		forumAuth.setSession(session);
		let nextUser = session.user;

		if (nextUser) {
			try {
				const [totpEnabled, currentAvatarUrl] = await Promise.all([
					getTotpStatus(),
					getCurrentUserAvatar(),
				]);
				nextUser = {
					...nextUser,
					totpEnabled,
					avatarUrl: currentAvatarUrl || nextUser.avatarUrl,
				};
			} catch {
				// ignore extra profile status errors and keep existing session data
			}
		}

		applyUser(nextUser);
		if (statusMessage) {
			status = statusMessage;
		}
		return nextUser;
	}

	async function loadSession() {
		loading = true;
		try {
			const params = new URLSearchParams(window.location.search);
			const emailChangeToken = params.get("email_change_token") || params.get("token");
			if (emailChangeToken) {
				try {
					const verifyResult = await verifyEmailChange(emailChangeToken);
					status = verifyResult.message || "邮箱变更已确认。";
				} catch (error) {
					status = error instanceof Error ? error.message : "邮箱确认失败。";
				}
				params.delete("email_change_token");
				params.delete("token");
				const nextQuery = params.toString();
				window.history.replaceState({}, "", nextQuery ? `?${nextQuery}` : window.location.pathname);
			}

			await refreshSession();
		} catch (error) {
			console.error(error);
			applyUser(null);
		} finally {
			loading = false;
		}
	}

	async function saveProfile() {
		if (!user || savingProfile) return;
		savingProfile = true;
		status = "正在保存资料...";
		try {
			await updateProfile({
				username: username.trim() || undefined,
				displayName: displayName.trim() || undefined,
				avatarUrl: avatarUrl.trim() || undefined,
				emailNotifications,
			});
			await refreshSession("资料已更新。");
		} catch (error) {
			status = error instanceof Error ? error.message : "资料更新失败。";
		} finally {
			savingProfile = false;
		}
	}

	async function handleAvatarUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file || !user) return;
		status = "正在压缩头像...";
		try {
			let uploadFileTarget = file;
			try {
				uploadFileTarget = await compressAvatarImage(file);
			} catch {
				uploadFileTarget = file;
			}
			status = uploadFileTarget === file ? "正在上传头像..." : "正在上传压缩后的头像...";
			const uploadedUrl = await uploadAvatar(uploadFileTarget);
			avatarUrl = uploadedUrl;
			status = "头像上传成功，请记得保存资料。";
		} catch (error) {
			status = error instanceof Error ? error.message : "头像上传失败。";
		}
	}

	async function requestEmailChange() {
		if (!user || changingEmail) return;
		changingEmail = true;
		status = "正在发送邮箱确认请求...";
		try {
			const result = await changeEmail({ newEmail: emailNew.trim(), totpCode: emailTotp.trim() || undefined });
			emailNew = "";
			emailTotp = "";
			await refreshSession(result.message || "确认邮件已发送至新邮箱，请前往查收。");
		} catch (error) {
			status = error instanceof Error ? error.message : "邮箱变更失败。";
		} finally {
			changingEmail = false;
		}
	}

	async function startTotpSetup() {
		if (!user || settingTotp) return;
		settingTotp = true;
		status = "正在准备 2FA...";
		try {
			const result = await setupTotp();
			totpSecret = result.secret;
			totpUri = result.uri;
			status = "请使用验证器录入密钥后输入验证码完成启用。";
		} catch (error) {
			status = error instanceof Error ? error.message : "2FA 初始化失败。";
		} finally {
			settingTotp = false;
		}
	}

	async function confirmTotp() {
		if (!user || settingTotp) return;
		settingTotp = true;
		status = "正在验证 2FA...";
		try {
			await verifyTotp({ token: totpCode.trim() });
			totpSecret = "";
			totpUri = "";
			totpCode = "";
			await refreshSession("2FA 已启用。");
		} catch (error) {
			status = error instanceof Error ? error.message : "2FA 验证失败。";
		} finally {
			settingTotp = false;
		}
	}

	async function submitDeleteAccount() {
		if (!user || deletingAccount) return;
		if (!window.confirm("确定要注销账号吗？此操作无法撤销。")) return;
		deletingAccount = true;
		status = "正在注销账号...";
		try {
			await deleteAccount({ password: deletePassword, totpCode: deleteTotp.trim() || undefined });
			forumAuth.clear();
			window.location.href = "/forum/";
		} catch (error) {
			status = error instanceof Error ? error.message : "账号注销失败。";
		} finally {
			deletingAccount = false;
		}
	}

	async function submitLogout() {
		try {
			await logout();
		} catch {
			// ignore api logout error and still clear local session
		}
		forumAuth.clear();
		window.location.href = "/forum/auth/login/";
	}

	onMount(() => {
		loadSession();
	});
</script>

<div class="space-y-6">
	<div class="card-base p-6 md:p-8 space-y-5">
		<div class="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<div class="flex items-center gap-2 mb-2">
					<Icon icon="material-symbols:account-circle-outline-rounded" class="text-3xl text-[var(--primary)]" />
					<h1 class="text-2xl font-bold text-white">个人设置</h1>
				</div>
				<p class="text-sm text-white/45">集中管理论坛资料、邮箱、2FA 与账号安全。</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
				{#if isAdminUser(user)}
					<a href="/forum/admin/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">进入管理控制台</a>
				{/if}
				<button class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/75" on:click={submitLogout}>退出登录</button>
			</div>
		</div>

		{#if loading}
			<p class="text-white/50">正在恢复会话...</p>
		{:else if !user}
			<div class="rounded-xl border border-white/10 bg-white/5 p-5 text-white/55">
				<p class="mb-3">当前尚未登录，无法查看论坛个人资料。</p>
				<a href="/forum/auth/login/" class="text-[var(--primary)]">前往登录</a>
			</div>
		{:else}
			{#if status}
				<div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">{status}</div>
			{/if}

			<div class="grid gap-4 md:grid-cols-1">
				<div class="rounded-xl border border-white/10 bg-white/5 p-5">
					<div class="text-sm text-white/40 mb-1">邮箱</div>
					<div class="text-lg font-bold text-white break-all">{user.email || "未公开"}</div>
				</div>
			</div>

			<div class="grid gap-6 lg:grid-cols-2">
				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">基础资料</h2>
					<div class="rounded-xl border border-white/10 bg-black/20 p-4">
						<div class="mb-3 text-sm text-white/50">当前头像</div>
						<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
							{#if avatarUrl}
								<img src={avatarUrl} alt="当前头像" class="h-20 w-20 rounded-full border border-white/10 object-cover" loading="lazy" referrerpolicy="no-referrer" />
							{:else}
								<div class="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/35">
									<Icon icon="material-symbols:person-outline-rounded" class="text-4xl" />
								</div>
							{/if}
							<div class="min-w-0 flex-1 space-y-2">
								<div class="text-sm text-white/50">头像 URL</div>
								<div class="flex items-center gap-2">
									<div class="min-w-0 flex-1 truncate rounded-lg bg-white/5 px-3 py-2 text-sm text-white/75" title={avatarUrl || ""}>{avatarUrl || "当前未设置头像 URL"}</div>
									<button class="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-50" type="button" disabled={!avatarUrl} on:click={copyAvatarUrl}>复制</button>
								</div>
							</div>
						</div>
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-profile-username">用户名</label>
						<input id="forum-profile-username" bind:value={username} class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" maxlength="20" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-profile-display-name">显示名称</label>
						<input id="forum-profile-display-name" bind:value={displayName} class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" maxlength="40" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-profile-avatar-url">头像 URL</label>
						<input id="forum-profile-avatar-url" bind:value={avatarUrl} class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-profile-avatar-file">上传头像</label>
						<input id="forum-profile-avatar-file" type="file" accept="image/*" class="block w-full text-sm text-white/60 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white/80" on:change={handleAvatarUpload} />
					</div>
					<label class="flex items-center gap-2 text-sm text-white/65">
						<input type="checkbox" bind:checked={emailNotifications} />
						接收论坛邮件通知
					</label>
					<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={savingProfile} on:click={saveProfile}>{savingProfile ? "保存中..." : "保存资料"}</button>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">邮箱变更</h2>
					<p class="text-sm text-white/45">提交后，确认链接会发送到新邮箱。</p>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-email-new">新邮箱地址</label>
						<input id="forum-email-new" bind:value={emailNew} type="email" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-email-totp">TOTP 验证码（如已启用）</label>
						<input id="forum-email-totp" bind:value={emailTotp} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<button class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/80 disabled:opacity-60" disabled={changingEmail} on:click={requestEmailChange}>{changingEmail ? "提交中..." : "发送确认邮件"}</button>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">双重验证（2FA / TOTP）</h2>
					{#if user.totpEnabled}
						<div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">当前账号已启用 2FA。</div>
					{:else}
						<p class="text-sm text-white/45">启用 2FA 后，登录与敏感操作将可使用动态验证码保护。</p>
						<button class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/80 disabled:opacity-60" disabled={settingTotp} on:click={startTotpSetup}>{settingTotp ? "准备中..." : "开始启用 2FA"}</button>
						{#if totpSecret}
							<div class="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
								<p class="text-sm text-white/60">请将以下密钥或 otpauth URI 添加到你的验证器应用。</p>
								<div>
									<div class="text-xs uppercase tracking-wide text-white/35">Secret</div>
									<div class="mt-1 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-sm text-white/80">{totpSecret}</div>
								</div>
								{#if totpUri}
									<div>
										<div class="text-xs uppercase tracking-wide text-white/35">URI</div>
										<div class="mt-1 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-white/60">{totpUri}</div>
									</div>
								{/if}
								<input bind:value={totpCode} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="输入 6 位验证码" />
								<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={settingTotp} on:click={confirmTotp}>{settingTotp ? "验证中..." : "验证并启用"}</button>
							</div>
						{/if}
					{/if}
				</section>

				<section class="rounded-2xl border border-red-400/20 bg-red-400/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-red-200">危险区域</h2>
					<p class="text-sm text-red-100/70">注销账号后，当前论坛账号数据无法恢复。</p>
					<div class="space-y-2">
						<label class="text-sm text-red-100/70" for="forum-delete-password">当前密码</label>
						<input id="forum-delete-password" bind:value={deletePassword} type="password" class="w-full rounded-xl border border-red-200/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-red-300/50" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-red-100/70" for="forum-delete-totp">TOTP 验证码（如已启用）</label>
						<input id="forum-delete-totp" bind:value={deleteTotp} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-red-200/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-red-300/50" />
					</div>
					<button class="rounded-xl bg-red-400 px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={deletingAccount} on:click={submitDeleteAccount}>{deletingAccount ? "处理中..." : "注销账号"}</button>
				</section>
			</div>
		{/if}
	</div>
</div>
