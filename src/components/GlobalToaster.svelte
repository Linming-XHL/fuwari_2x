<script lang="ts">
	import { onMount } from "svelte";
	import { Toaster, toast } from "svelte-sonner";
	import { FORUM_TOAST_EVENT, type ForumToastDetail } from "@/forum/utils/toast";

	onMount(() => {
		const handleToast = (event: Event) => {
			const detail = (event as CustomEvent<ForumToastDetail>).detail;
			const payload = {
				description: detail.description,
			};

			switch (detail.type) {
				case "success":
					toast.success(detail.title, payload);
					break;
				case "warning":
					toast.warning(detail.title, payload);
					break;
				case "info":
					toast.info(detail.title, payload);
					break;
				default:
					toast.error(detail.title, payload);
			}
		};

		window.addEventListener(FORUM_TOAST_EVENT, handleToast);
		return () => window.removeEventListener(FORUM_TOAST_EVENT, handleToast);
	});
</script>

<Toaster theme="dark" richColors position="bottom-right" />
