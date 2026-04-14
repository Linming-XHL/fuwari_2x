<script lang="ts">
import {
	getDevMode,
	getDevServer,
	getHideBg,
	setDevMode,
	setDevServer,
	setHideBg,
} from "@utils/setting-utils";

const isBrowser = typeof document !== "undefined";

let hideBg = isBrowser ? getHideBg() : false;
let isDevMode = isBrowser ? getDevMode() : false;
let devServer = isBrowser ? getDevServer() : "";

function toggleHideBg() {
	hideBg = !hideBg;
	setHideBg(hideBg);
}

function toggleDevMode() {
	isDevMode = !isDevMode;
	setDevMode(isDevMode);
}

function onDevServerChange() {
	setDevServer(devServer);
}
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-80 right-4 px-4 py-4">

    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-neutral-100 transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            禁用背景
        </div>
        <input aria-label="Hide Background" type="checkbox" class="toggle-switch" checked={hideBg} onchange={toggleHideBg} />
    </div>

    <div class="flex flex-row gap-2 mb-3 mt-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-neutral-100 transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            开发模式
        </div>
        <input aria-label="Developer Mode" type="checkbox" class="toggle-switch" checked={isDevMode} onchange={toggleDevMode} />
    </div>

    {#if isDevMode}
    <div class="flex flex-row gap-2 mb-3 items-center justify-between transition-all" >
        <div class="flex gap-2 font-bold text-lg text-neutral-100 transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            Server
        </div>
        <div class="flex gap-1">
             <input aria-label="Server Value" type="text" bind:value={devServer} oninput={onDevServerChange}
                   class="transition bg-[var(--btn-regular-bg)] w-32 h-7 rounded-md text-center font-bold text-sm text-[var(--btn-content)] outline-none"
            />
        </div>
    </div>
    {/if}
</div>



