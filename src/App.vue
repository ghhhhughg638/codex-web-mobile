<template>
  <div :class="['mobile-app', `appearance-${appearanceMode}`]">
    <header class="topbar">
      <button class="icon-button mobile-nav-trigger" type="button" :aria-label="t('app.openNavigation')" @click="drawerOpen = true">☰</button>
      <div class="brand-lockup">
        <strong>Codex</strong>
        <span>{{ viewTitle }}</span>
      </div>
      <div class="topbar-actions">
        <span class="server-indicator"><i />{{ t('app.local') }}</span>
        <button class="icon-button" type="button" :aria-label="t('app.skills')" :title="t('app.skills')" @click="openView('skills')">✦</button>
        <button class="icon-button" type="button" :aria-label="t('app.settings')" :title="t('app.settings')" @click="openView('settings')">⚙</button>
        <LocaleMenu />
        <AppearanceMenu v-model="appearanceMode" />
      </div>
    </header>

    <div v-if="drawerOpen" class="drawer-backdrop" @click="drawerOpen = false" />
    <aside class="mobile-drawer" :class="{ 'is-open': drawerOpen }">
      <div class="drawer-header">
        <div><strong>{{ t('app.workspace') }}</strong><span>{{ t('app.server') }}</span></div>
        <button class="icon-button mobile-nav-close" type="button" :aria-label="t('app.closeNavigation')" @click="drawerOpen = false">×</button>
      </div>
      <button class="primary-button drawer-new-thread" type="button" @click="startNewThread"><span aria-hidden="true">+</span>{{ t('app.new') }}</button>
      <nav class="drawer-nav" :aria-label="t('app.primaryNavigation')">
        <button :class="['nav-item', { active: view === 'chat' }]" type="button" @click="openView('chat')"><span class="nav-icon">◫</span>{{ t('app.chat') }}</button>
        <button :class="['nav-item', { active: view === 'skills' }]" type="button" @click="openView('skills')"><span class="nav-icon">✦</span>{{ t('app.skills') }}</button>
        <button :class="['nav-item', { active: view === 'integrations' }]" type="button" @click="openView('integrations')"><span class="nav-icon">⌘</span>{{ t('app.integrations') }}</button>
        <button :class="['nav-item', { active: view === 'browser' }]" type="button" @click="openView('browser')"><span class="nav-icon">◎</span>{{ t('app.browser') }}</button>
        <button :class="['nav-item', { active: view === 'files' }]" type="button" @click="openView('files')"><span class="nav-icon">▣</span>{{ t('app.files') }}</button>
        <button :class="['nav-item', { active: view === 'settings' }]" type="button" @click="openView('settings')"><span class="nav-icon">⚙</span>{{ t('app.settings') }}</button>
      </nav>
      <div v-if="view === 'chat'" class="thread-list">
        <div class="thread-search-wrap"><input v-model="threadSearchQuery" class="thread-search" :placeholder="t('app.searchThreads')" /><span>⌕</span></div>
        <SidebarThreadTree :groups="projectGroups" :project-display-name-by-id="projectDisplayNameById" :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads" :search-query="threadSearchQuery" @select="onSelectThread" @archive="onArchiveThread" @archive-request="onArchiveRequest" @rename="onRenameThread" @rename-request="onRenameRequest" @start-new-thread="onStartNewThread" @rename-project="onRenameProject" @remove-project="onRemoveProject" @reorder-project="onReorderProject" />
        <!-- thread tree owns collapse, archive, pin and project actions -->
      </div>
    </aside>

    <main class="main-stage">
      <section v-if="view === 'chat'" class="chat-stage">
        <div class="chat-workspace" :class="{ 'home-workspace': isHomeRoute }">
        <div class="chat-main-column">
        <div v-if="!isHomeRoute" class="session-status" aria-live="polite">
          <div class="session-status-head">
            <div class="session-status-main"><span :class="['status-pill', `status-${isSelectedThreadInProgress ? 'working' : selectedTelemetry.status}`]"><i />{{ statusLabel(isSelectedThreadInProgress ? 'working' : selectedTelemetry.status) }}</span><time v-if="liveOverlay?.elapsedLabel" class="session-elapsed">{{ liveOverlay.elapsedLabel }}</time></div>
            <div class="session-status-actions"><button class="conversation-balance" type="button" :class="{ 'is-loading': balanceLoading }" :title="t('balance.refresh')" @click="loadCurrentBalance"><span class="conversation-balance-dot" aria-hidden="true" /><span>{{ currentBalance ? `${formatBalanceNumber(currentBalance.remaining)} ${currentBalance.currency}` : balanceLoading ? t('balance.checking') : '—' }}</span></button><AppMenu v-model="sessionMode" class-name="mode-select-control" :options="modeOptions" :aria-label="t('app.sessionMode')" /></div>
          </div>
          <div class="session-status-metrics">
            <span>{{ t('stats.threadTokens') }} <strong>{{ selectedTelemetry.totalTokens > 0 ? formatTokens(selectedTelemetry.totalTokens) : t('common.noData') }}</strong></span>
            <span>{{ t('stats.working') }} <strong>{{ formatDuration(selectedTelemetry.workingMs) }}</strong></span>
            <span>{{ t('stats.turnDuration') }} <strong>{{ turnStats.duration > 0 ? formatDuration(turnStats.duration) : t('common.noData') }}</strong></span>
            <span>{{ t('stats.turnTokens') }} <strong>{{ turnStats.total > 0 ? formatTokens(turnStats.total) : t('common.noData') }}</strong></span>
            <span>{{ t('stats.turnOutput') }} <strong>{{ turnStats.output > 0 ? formatTokens(turnStats.output) : t('common.noData') }}</strong></span>
            <span>{{ t('stats.outputSpeed') }} <strong>{{ turnStats.speed > 0 ? `${formatSpeed(turnStats.speed)} ${t('stats.tokensPerSecond')}` : t('common.noData') }}</strong></span>
            <span v-if="selectedTelemetry.contextWindow > 0">{{ t('inspector.context') }} <strong>{{ formatTokens(selectedTelemetry.currentContextTokens) }} / {{ formatTokens(selectedTelemetry.contextWindow) }}</strong></span>
          </div>
        </div>
        <div v-if="isHomeRoute" class="new-thread-card">
          <div class="home-heading-row"><div class="eyebrow">{{ t('home.eyebrow') }}</div><AppMenu v-model="sessionMode" class-name="mode-select-control" :options="modeOptions" :aria-label="t('app.sessionMode')" /></div><h1>{{ t('home.title') }}</h1>
          <p>{{ t('home.subtitle') }}</p>
          <label class="field-label" for="new-thread-cwd">{{ t('home.workspace') }}</label>
          <AppSelect id="new-thread-cwd" v-model="newThreadCwd" class-name="workspace-select" :options="workspaceOptions" :placeholder="t('home.chooseFolder')" :aria-label="t('home.workspace')" />
          <div v-if="selectedSkillNames.length > 0" class="selection-strip">{{ t('skills.selected') }}: {{ selectedSkillNames.join(', ') }}</div>
          <div class="quick-start-section"><div class="section-heading"><strong>{{ t('home.quickStart') }}</strong><span>{{ t('app.oneTap') }}</span></div><div class="quick-starts"><button type="button" @click="seedTask('explore')"><span class="quick-icon teal">⌕</span><span><strong>{{ t('home.explore') }}</strong><small>{{ t('home.exploreHint') }}</small></span><b>↗</b></button><button type="button" @click="seedTask('fix')"><span class="quick-icon coral">⌁</span><span><strong>{{ t('home.fix') }}</strong><small>{{ t('home.fixHint') }}</small></span><b>↗</b></button><button type="button" @click="seedTask('review')"><span class="quick-icon green">✓</span><span><strong>{{ t('home.review') }}</strong><small>{{ t('home.reviewHint') }}</small></span><b>↗</b></button></div></div>
        </div>
        <section v-if="!isHomeRoute && selectedTelemetry.plan.length > 0" class="plan-panel" :aria-label="t('plan.title')">
          <div class="plan-panel-header"><strong>{{ t('plan.title') }}</strong><span>{{ planProgress(selectedTelemetry.plan) }}</span></div>
          <ol><li v-for="step in selectedTelemetry.plan" :key="step.step" :class="`plan-${step.status}`"><span class="plan-marker" />{{ step.step }}</li></ol>
        </section>
        <details v-if="!isHomeRoute && selectedTelemetry.diff" class="diff-panel">
          <summary><strong>{{ t('plan.changes') }}</strong><span>{{ diffStats(selectedTelemetry.diff) }}</span></summary>
          <pre>{{ selectedTelemetry.diff }}</pre>
        </details>
        <ThreadConversation v-if="!isHomeRoute" class="thread-view" :messages="filteredMessages" :is-loading="isLoadingMessages" :active-thread-id="composerThreadContextId" :scroll-state="selectedThreadScrollState" :live-overlay="liveOverlay" :pending-requests="selectedThreadServerRequests" @update-scroll-state="onUpdateThreadScrollState" @respond-server-request="onRespondServerRequest" @edit-message="onEditMessage" />
        <div v-if="error" class="error-banner">{{ error }}</div>
        <div v-if="attachedFiles.length > 0" class="attached-files"><span v-for="file in attachedFiles" :key="file.path" class="attached-file">{{ file.name }}<button type="button" :aria-label="t('files.remove')" @click="removeAttachment(file.path)">×</button></span></div>
        <ThreadComposer :active-thread-id="composerThreadContextId" :disabled="isLoadingMessages" :is-sending-message="isSendingMessage" :models="availableModels" :selected-model="selectedModelId" :selected-reasoning-effort="selectedReasoningEffort" :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn" :has-attachments="attachedFiles.length > 0" :seed-text="composerSeed" @seed-consumed="composerSeed = ''" @submit="onSubmitThreadMessage" @steer="onGuideMessage" @interrupt-and-send="onInterruptAndSendMessage" @open-files="openFilePicker" @command="runSlashCommand" @update:selected-model="onSelectModel" @update:selected-reasoning-effort="onSelectReasoningEffort" @interrupt="onInterruptTurn" />
        </div>
        <aside v-if="!isHomeRoute" class="session-inspector">
          <div class="inspector-heading"><span class="eyebrow">{{ t('inspector.eyebrow') }}</span><strong>{{ t('inspector.session') }}</strong></div>
          <section class="inspector-section"><div class="inspector-label">{{ t('inspector.context') }}<span v-if="selectedTelemetry.contextWindow > 0">{{ formatTokens(selectedTelemetry.currentContextTokens) }} / {{ formatTokens(selectedTelemetry.contextWindow) }}</span></div><template v-if="selectedTelemetry.contextWindow > 0"><div class="context-track"><i :style="{ width: `${contextPercent}%` }" /></div><small>{{ contextPercent }}% {{ t('inspector.used') }}</small></template><p v-else class="inspector-empty">{{ t('inspector.noUsage') }}</p></section>
          <section class="inspector-section"><div class="inspector-label">{{ t('inspector.tokens') }}<span v-if="selectedTelemetry.totalTokens > 0">{{ formatTokens(selectedTelemetry.totalTokens) }}</span></div><template v-if="selectedTelemetry.totalTokens > 0"><div class="token-row"><span>{{ t('inspector.input') }}</span><strong>{{ formatTokens(selectedTelemetry.inputTokens) }}</strong></div><div class="token-row"><span>{{ t('inspector.output') }}</span><strong>{{ formatTokens(selectedTelemetry.outputTokens) }}</strong></div><div class="token-row"><span>{{ t('inspector.reasoning') }}</span><strong>{{ formatTokens(selectedTelemetry.reasoningOutputTokens) }}</strong></div><div class="token-row"><span>{{ t('inspector.cached') }}</span><strong>{{ formatTokens(selectedTelemetry.cachedInputTokens) }}</strong></div></template><p v-else class="inspector-empty">{{ t('inspector.noUsage') }}</p></section>
          <section class="inspector-section"><div class="inspector-label">{{ t('stats.turnTokens') }}</div><div class="token-row"><span>{{ t('stats.turnTokens') }}</span><strong>{{ turnStats.total > 0 ? formatTokens(turnStats.total) : t('common.noData') }}</strong></div><div class="token-row"><span>{{ t('stats.turnOutput') }}</span><strong>{{ turnStats.output > 0 ? formatTokens(turnStats.output) : t('common.noData') }}</strong></div><div class="token-row"><span>{{ t('stats.outputSpeed') }}</span><strong>{{ turnStats.speed > 0 ? `${formatSpeed(turnStats.speed)} ${t('stats.tokensPerSecond')}` : t('common.noData') }}</strong></div></section>
          <section class="inspector-section"><div class="inspector-label">{{ t('inspector.run') }}</div><div class="inspector-fact"><span>{{ t('inspector.state') }}</span><strong>{{ statusLabel(selectedTelemetry.status) }}</strong></div><div class="inspector-fact"><span>{{ t('inspector.workingTime') }}</span><strong>{{ formatDuration(selectedTelemetry.workingMs) }}</strong></div><div class="inspector-fact"><span>{{ t('inspector.turnCount') }}</span><strong>{{ selectedTelemetry.turns }}</strong></div></section>
          <section class="inspector-section"><div class="inspector-label">{{ t('inspector.model') }}</div><div class="model-summary"><span class="model-orbit">✳</span><div><strong>{{ selectedModelId || t('common.unknown') }}</strong><small>{{ selectedReasoningEffort || t('common.default') }}</small></div></div></section>
          <section v-if="selectedSkillNames.length > 0" class="inspector-section"><div class="inspector-label">{{ t('inspector.skills') }}</div><span v-for="name in selectedSkillNames" :key="name" class="skill-token">{{ name }}</span></section>
        </aside>
        </div>
      </section>

      <section v-else-if="view === 'settings'" class="management-stage">
        <div class="page-heading"><div class="eyebrow">{{ t('settings.eyebrow') }}</div><h1>{{ t('settings.title') }}</h1><p>{{ t('settings.subtitle') }}</p></div>
        <div class="settings-tabs" role="tablist"><button :class="{ active: settingsTab === 'connection' }" type="button" @click="setSettingsTab('connection')">{{ t('settings.connection') }}</button><button :class="{ active: settingsTab === 'balance' }" type="button" @click="setSettingsTab('balance')">{{ t('balance.title') }}</button><button :class="{ active: settingsTab === 'runtime' }" type="button" @click="setSettingsTab('runtime')">{{ t('settings.runtime') }}</button><button :class="{ active: settingsTab === 'toml' }" type="button" @click="setSettingsTab('toml')">{{ t('settings.toml') }}</button></div>
        <form v-if="settingsTab !== 'toml'" class="settings-form" @submit.prevent="saveStructuredConfig">
          <div v-if="settingsTab === 'connection'" class="form-section">
            <label class="field-label" for="provider-name">{{ t('settings.provider') }}</label><n-input id="provider-name" v-model:value="settings.providerName" autocomplete="off" />
            <label class="field-label" for="base-url">{{ t('settings.baseUrl') }}</label><n-input id="base-url" v-model:value="settings.baseUrl" inputmode="url" autocomplete="url" />
            <label class="field-label" for="api-key">{{ t('settings.apiKey') }}</label><div class="secret-field"><n-input id="api-key" v-model:value="settings.apiKey" :type="revealSecrets ? 'text' : 'password'" autocomplete="off" /><n-button secondary class="secret-toggle" attr-type="button" :loading="isRevealingSecrets" @click="toggleRevealSecrets">{{ revealSecrets ? t('settings.hide') : t('settings.show') }}</n-button></div><p class="field-note">{{ t('settings.authSource') }}: {{ configAuthPath || '~/.codex/auth.json' }} · {{ t('settings.authEditHint') }}</p>
            <label class="field-label" for="model-name">{{ t('settings.model') }}</label><n-input id="model-name" v-model:value="settings.model" autocomplete="off" />
            <label class="field-label" for="wire-api">{{ t('settings.wireApi') }}</label><AppSelect id="wire-api" v-model="settings.wireApi" :options="wireApiOptions" :aria-label="t('settings.wireApi')" />
          </div>
          <div v-else-if="settingsTab === 'runtime'" class="form-section">
            <label class="field-label" for="runtime-host">{{ t('settings.listen') }}</label><AppSelect id="runtime-host" v-model="runtimeHost" :options="runtimeHostOptions" :aria-label="t('settings.listen')" />
            <label class="field-label" for="runtime-port">{{ t('settings.port') }}</label><n-input id="runtime-port" v-model:value="runtimePort" inputmode="numeric" />
            <label class="field-label" for="reasoning-effort">{{ t('settings.effort') }}</label><AppSelect id="reasoning-effort" v-model="settings.reasoningEffort" :options="reasoningSelectOptions" :aria-label="t('settings.effort')" />
            <label class="field-label" for="context-window">{{ t('settings.contextWindow') }}</label><n-input id="context-window" v-model:value="settings.contextWindow" inputmode="numeric" />
            <label class="field-label" for="personality">{{ t('settings.personality') }}</label><AppSelect id="personality" v-model="settings.personality" :options="personalityOptions" :aria-label="t('settings.personality')" />
            <div class="notice">{{ t('settings.notice') }}</div>
          </div>
          <div v-else class="form-section balance-settings-form">
            <div class="current-provider-heading"><span class="eyebrow">{{ settings.providerName || 'Codex' }}</span><strong>{{ settings.model || t('settings.model') }}</strong></div>
            <p class="current-balance-note">{{ t('balance.credentialNotice') }}</p>
            <section class="balance-result balance-settings-result" aria-live="polite">
              <div class="balance-result-heading"><span>{{ t('balance.remaining') }}</span><time>{{ currentBalance ? formatBalanceTime(currentBalance.queriedAt) : t('common.noData') }}</time></div>
              <strong>{{ currentBalance ? formatBalanceNumber(currentBalance.remaining) : '—' }} <small>{{ currentBalance?.currency || 'USD' }}</small></strong>
              <div class="balance-result-details"><span>{{ t('balance.endpoint') }} <b>/v1/usage</b></span><span>{{ t('balance.provider') }} <b>{{ settings.baseUrl || t('common.unknown') }}</b></span></div>
            </section>
            <p v-if="balanceError" class="error-banner">{{ balanceError }}</p>
            <n-button type="primary" :loading="balanceLoading" @click="loadCurrentBalance">{{ t('balance.query') }}</n-button>
          </div>
          <button v-if="settingsTab !== 'balance'" class="primary-button" type="submit" :disabled="isSavingConfig">{{ isSavingConfig ? t('settings.saving') : t('settings.save') }}</button>
        </form>
        <section v-else class="toml-editor-section"><div class="editor-toolbar"><div class="editor-path"><span class="muted-text">{{ configPath || '~/.codex/config.toml' }}</span><small>{{ t('settings.authSource') }}: {{ configAuthPath || '~/.codex/auth.json' }}</small></div><button class="secondary-button" type="button" :disabled="isRevealingSecrets" @click="toggleRevealSecrets">{{ revealSecrets ? t('settings.hide') : t('settings.revealKey') }}</button></div><div v-if="revealSecrets" class="auth-key-preview"><span>{{ t('settings.apiKey') }}</span><code>{{ settings.apiKey || t('common.noData') }}</code></div><n-input v-model:value="configRaw" class="toml-editor" type="textarea" :autosize="{ minRows: 16 }" spellcheck="false" aria-label="config.toml" /><div class="editor-actions"><button class="secondary-button" type="button" @click="validateRawConfig">{{ t('settings.validate') }}</button><button class="primary-button" type="button" @click="saveRawConfig">{{ t('settings.saveToml') }}</button></div><div class="backup-row"><AppSelect v-model="selectedBackup" class-name="backup-select" :options="backupOptions" :placeholder="t('settings.chooseBackup')" :aria-label="t('settings.chooseBackup')" /><button class="secondary-button" type="button" :disabled="!selectedBackup" @click="restoreSelectedBackup">{{ t('settings.restore') }}</button></div></section>
        <p v-if="settingsMessage" class="status-message">{{ settingsMessage }}</p><p v-if="settingsError" class="error-banner">{{ settingsError }}</p>
      </section>

      <section v-else-if="view === 'skills'" class="management-stage">
        <div class="page-heading"><div class="eyebrow">{{ t('skills.eyebrow') }}</div><h1>{{ t('skills.title') }}</h1><p>{{ t('skills.subtitle') }}</p></div>
        <form class="install-row" @submit.prevent="installSkillFromForm"><n-input v-model:value="skillSource" :placeholder="t('skills.source')" autocomplete="off" /><n-input v-model:value="skillName" :placeholder="t('skills.name')" autocomplete="off" /><n-button type="primary" attr-type="submit" :loading="isInstallingSkill">{{ isInstallingSkill ? t('skills.installing') : t('skills.install') }}</n-button></form>
        <div class="skills-toolbar"><n-input v-model:value="skillSearchQuery" :placeholder="t('skills.search')" clearable /><div class="skills-toolbar-actions"><n-button secondary size="small" @click="selectAllSkills">{{ t('skills.selectAll') }}</n-button><n-button secondary size="small" @click="clearSelectedSkills">{{ t('skills.clearAll') }}</n-button><span>{{ selectedSkillIds.length }} {{ t('skills.selectedCount') }}</span></div></div>
        <div class="skills-list"><article v-for="skill in filteredSkills" :key="skill.id" class="skill-row"><div class="skill-main"><n-checkbox :checked="selectedSkillIds.includes(skill.id)" @update:checked="toggleSkillSelection(skill.id, $event)" /><span><strong>{{ skill.name }}</strong><small>{{ skill.description }}</small><code>{{ skill.path }}</code></span></div><div class="skill-actions"><n-button secondary size="small" @click="toggleSkill(skill)">{{ skill.enabled ? t('skills.disable') : t('skills.enable') }}</n-button><n-button tertiary type="error" size="small" @click="deleteSkill(skill)">{{ t('skills.delete') }}</n-button></div></article><p v-if="!isLoadingSkills && filteredSkills.length === 0" class="empty-panel">{{ skills.length === 0 ? t('skills.empty') : t('skills.noMatches') }}</p></div>
        <p v-if="skillsMessage" class="status-message">{{ skillsMessage }}</p><p v-if="skillsError" class="error-banner">{{ skillsError }}</p>
      </section>

      <section v-else-if="view === 'integrations'" class="management-stage">
        <div class="page-heading"><div class="eyebrow">{{ t('integrations.eyebrow') }}</div><h1>{{ t('integrations.title') }}</h1><p>{{ t('integrations.subtitle') }}</p></div>
        <div class="integration-toolbar"><button class="secondary-button" type="button" @click="loadIntegrations">{{ t('integrations.refresh') }}</button><button class="primary-button" type="button" @click="installPlugin">{{ t('integrations.install') }}</button></div>
        <section class="integration-section"><div class="section-heading"><strong>{{ t('integrations.plugins') }}</strong><span>{{ plugins.length }}</span></div><article v-for="plugin in plugins" :key="String(plugin.id || plugin.name)" class="integration-row"><div><strong>{{ plugin.name || plugin.id || t('common.unknown') }}</strong><small>{{ plugin.description || plugin.path || t('common.installed') }}</small></div><button class="danger-button" type="button" @click="uninstallPlugin(plugin)">{{ t('integrations.uninstall') }}</button></article><p v-if="plugins.length === 0" class="empty-panel">{{ t('integrations.emptyPlugins') }}</p></section>
        <section class="integration-section"><div class="section-heading"><strong>{{ t('integrations.servers') }}</strong><span>{{ mcpServers.length }}</span></div><article v-for="server in mcpServers" :key="String(server.name || server.id)" class="integration-row"><div><strong>{{ server.name || server.id || t('common.unknown') }}</strong><small>{{ server.status || server.authStatus || t('common.noData') }}</small></div><span :class="['status-pill', server.status === 'ready' ? 'status-completed' : 'status-waiting']"><i />{{ server.status || t('common.unknown') }}</span></article><p v-if="mcpServers.length === 0" class="empty-panel">{{ t('integrations.emptyServers') }}</p></section>
        <p v-if="integrationMessage" class="status-message">{{ integrationMessage }}</p><p v-if="integrationError" class="error-banner">{{ integrationError }}</p>
      </section>

      <section v-else-if="view === 'browser'" class="management-stage browser-stage">
        <div class="page-heading"><div class="eyebrow">{{ t('browser.eyebrow') }}</div><h1>{{ t('browser.title') }}</h1><p>{{ t('browser.subtitle') }}</p></div>
        <form class="browser-toolbar" @submit.prevent="openBrowserUrl"><n-input v-model:value="browserUrl" inputmode="url" :placeholder="t('browser.placeholder')" /><n-button type="primary" attr-type="submit">{{ t('browser.open') }}</n-button></form>
        <div v-if="browserUrl" class="browser-frame-shell">
          <div v-if="browserFrameLoading" class="browser-frame-status"><span class="loading-spinner" />{{ t('browser.loading') }}</div>
          <iframe :key="browserUrl" class="browser-frame" :src="browserUrl" sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin allow-downloads" title="Embedded browser" @load="browserFrameLoading = false" />
          <div class="browser-frame-footer"><span>{{ t('browser.embedNotice') }}</span><n-button tertiary size="small" @click="openBrowserExternal">{{ t('browser.openExternal') }}</n-button></div>
        </div>
        <div v-else class="browser-empty">{{ t('browser.empty') }}</div>
      </section>

      <FileManager v-else />
    </main>

    <ActivityDock v-if="view === 'chat' && !isHomeRoute && (selectedThreadActivityEvents.length > 0 || liveOverlay || isSelectedThreadInProgress)" :events="selectedThreadActivityEvents" :live-overlay="liveOverlay" :is-working="isSelectedThreadInProgress" />

    <n-modal v-model:show="promptState.show" preset="card" :title="promptState.title" :style="{ width: 'min(520px, calc(100vw - 32px))' }" :mask-closable="false" @close="cancelPrompt">
      <p class="prompt-description">{{ promptState.description }}</p>
      <n-input v-model:value="promptState.value" autofocus @keyup.enter="submitPrompt" />
      <div class="prompt-actions">
        <n-button secondary @click="cancelPrompt">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :disabled="!promptState.value.trim()" @click="submitPrompt">{{ t('common.confirm') }}</n-button>
      </div>
    </n-modal>

    <div v-if="commandOpen" class="command-backdrop" @click.self="commandOpen = false"><section class="command-palette"><div class="command-heading"><strong>{{ t('command.title') }}</strong><span>/</span></div><input ref="commandInput" v-model="commandQuery" class="field-control" :placeholder="t('command.search')" autofocus @keydown.escape="commandOpen = false" @keydown.enter="runFirstCommand"><button v-for="command in filteredCommands" :key="command.id" class="command-item" type="button" @click="runCommand(command.id)"><strong>{{ command.label }}</strong><small>{{ command.description }}</small></button></section></div>
    <div v-if="quickPanel" class="command-backdrop" @click.self="quickPanel = null"><section class="quick-panel-modal"><div class="command-heading"><strong>{{ quickPanel === 'model' ? t('slash.modelPanel') : quickPanel === 'context' ? t('slash.contextPanel') : t('command.status') }}</strong><button class="icon-button" type="button" :aria-label="t('files.close')" @click="quickPanel = null">×</button></div><template v-if="quickPanel === 'model'"><p class="panel-current-model">{{ t('slash.activeModel') }}: {{ selectedModelId }}</p><button v-for="model in availableModels" :key="model.id" :class="['model-option', { selected: selectedModelId === model.id }]" type="button" @click="setSelectedModelIdFromCommand(model.id)"><span><strong>{{ model.displayName }}</strong><small>{{ model.id }} · {{ model.description }}</small></span><b v-if="selectedModelId === model.id">✓</b></button></template><template v-else><div class="quick-stat-grid"><article><small>{{ t('inspector.state') }}</small><strong>{{ statusLabel(selectedTelemetry.status) }}</strong></article><article><small>{{ t('inspector.workingTime') }}</small><strong>{{ formatDuration(selectedTelemetry.workingMs) }}</strong></article><article><small>{{ t('inspector.context') }}</small><strong>{{ formatTokens(selectedTelemetry.currentContextTokens) }} / {{ formatTokens(selectedTelemetry.contextWindow) }}</strong></article><article><small>{{ t('stats.threadTokens') }}</small><strong>{{ formatTokens(selectedTelemetry.totalTokens) }}</strong></article><article><small>{{ t('stats.localTokens') }}</small><strong>{{ formatTokens(localTelemetry.totals.value.totalTokens) }}</strong></article><article><small>{{ t('inspector.turnCount') }}</small><strong>{{ selectedTelemetry.turns }}</strong></article></div></template></section></div>
    <div v-if="filePickerOpen" class="command-backdrop" @click.self="filePickerOpen = false"><section class="file-picker"><div class="command-heading"><strong>{{ t('files.title') }}</strong><button class="icon-button" type="button" :aria-label="t('files.close')" @click="filePickerOpen = false">×</button></div><div class="file-picker-toolbar"><input v-model="fileBrowserPath" class="field-control" :placeholder="t('files.path')" @keydown.enter="loadDirectory"><button class="secondary-button" type="button" @click="loadDirectory">{{ t('files.open') }}</button><button class="primary-button" type="button" @click="uploadInput?.click()">{{ t('files.upload') }}</button><input ref="uploadInput" type="file" multiple hidden @change="uploadSelectedFile"></div><div v-if="attachedFiles.length > 0" class="picker-selection"><span v-for="file in attachedFiles" :key="file.path" class="attached-file">{{ file.name }}<button type="button" :aria-label="t('files.remove')" @click="removeAttachment(file.path)">×</button></span></div><div class="file-picker-path">{{ fileBrowserPath || t('files.home') }}</div><div class="file-list"><button v-if="fileParentPath" class="file-entry file-directory" type="button" @click="openDirectory(fileParentPath)">..</button><button v-for="entry in fileEntries" :key="entry.path" :class="['file-entry', entry.type === 'directory' ? 'file-directory' : 'file-file', { selected: attachedFiles.some((file) => file.path === entry.path) }]" type="button" @click="entry.type === 'directory' ? openDirectory(entry.path) : attachFile(entry)"><span>{{ entry.type === 'directory' ? t('files.folder') : t('files.file') }}</span><strong>{{ entry.name }}</strong><small>{{ entry.type === 'file' ? formatBytes(entry.size) : '' }}</small></button><p v-if="fileError" class="error-banner">{{ fileError }}</p><p v-if="!fileLoading && fileEntries.length === 0 && !fileError" class="empty-panel">{{ t('files.empty') }}</p></div><pre v-if="filePreview" class="file-preview">{{ filePreview }}</pre></section></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { NButton, NCheckbox, NInput, NModal, useDialog, useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ThreadConversation from './components/content/ThreadConversation.vue'
import ActivityDock from './components/content/ActivityDock.vue'
import AppSelect from './components/ui/AppSelect.vue'
import AppMenu from './components/ui/AppMenu.vue'
import LocaleMenu from './components/ui/LocaleMenu.vue'
import AppearanceMenu from './components/ui/AppearanceMenu.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import FileManager from './components/content/FileManager.vue'
import { useDesktopState } from './composables/useDesktopState'
import { getSkillContent } from './api/localManagement'
import { useLocale } from './composables/useLocale'
import type { ReasoningEffort, ThreadScrollState, UiFileAttachment } from './types/codex'

type ViewName = 'chat' | 'skills' | 'settings' | 'integrations' | 'browser' | 'files'
type SettingsTab = 'connection' | 'balance' | 'runtime' | 'toml'
type Skill = { id: string; name: string; description: string; path: string; enabled: boolean; updatedAt: string }
type ConfigResponse = { path: string; config: Record<string, any>; raw: string; revealed: boolean; authPath?: string; hasApiKey?: boolean; apiKeySource?: string }
type BalanceQueryResult = { total: number; used: number | null; remaining: number; currency: string; queriedAt: string }

const { projectGroups, projectDisplayNameById, selectedThread, selectedThreadScrollState, selectedThreadServerRequests, selectedThreadActivityEvents, selectedLiveOverlay, selectedThreadId, availableModels, selectedModelId, selectedReasoningEffort, messages, isLoadingThreads, isLoadingMessages, isSendingMessage, isInterruptingTurn, error, refreshAll, selectThread, setThreadScrollState, archiveThreadById, renameThreadById, renameProject, removeProject, reorderProject, sendMessageToSelectedThread, steerSelectedThreadTurn, interruptAndSendToSelectedThread, sendMessageToNewThread, interruptSelectedThreadTurn, setSelectedModelId, setSelectedReasoningEffort, respondToPendingServerRequest, startPolling, stopPolling, localTelemetry } = useDesktopState()
const route = useRoute()
const router = useRouter()
const { locale, t } = useLocale()
const dialog = useDialog()
const message = useMessage()
const APPEARANCE_STORAGE_KEY = 'codex-web-mobile.appearance.v1'

function loadAppearanceMode(): 'codex' | 'comet' | 'midnight' {
  const value = typeof window !== 'undefined' ? window.localStorage.getItem(APPEARANCE_STORAGE_KEY) : null
  return value === 'comet' || value === 'midnight' ? value : 'codex'
}
const view = ref<ViewName>('chat')
const appearanceMode = ref<'codex' | 'comet' | 'midnight'>(loadAppearanceMode())
const drawerOpen = ref(false)
const threadSearchQuery = ref('')
const filePickerOpen = ref(false)
const fileBrowserPath = ref('')
const fileParentPath = ref('')
const fileEntries = ref<Array<{ name: string; path: string; type: 'file' | 'directory'; size: number }>>([])
const fileLoading = ref(false)
const fileError = ref('')
const filePreview = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<UiFileAttachment[]>([])
const commandOpen = ref(false)
const commandQuery = ref('')
const commandInput = ref<HTMLInputElement | null>(null)
const quickPanel = ref<'status' | 'context' | 'model' | null>(null)
const sessionMode = ref<'default' | 'plan'>('default')
const composerSeed = ref('')
const browserUrl = ref('')
const browserFrameLoading = ref(false)
const updateState = reactive({ checked: false, checking: false, available: false, current: '', latest: '', error: '', installing: false, message: '' })
const settingsTab = ref<SettingsTab>('connection')
const balanceError = ref('')
const currentBalance = ref<BalanceQueryResult | null>(null)
const balanceLoading = ref(false)
const newThreadCwd = ref('')
const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const settings = reactive({ providerName: 'mycodex', baseUrl: '', apiKey: '', model: '', wireApi: 'responses', reasoningEffort: 'xhigh', contextWindow: '1050000', personality: 'pragmatic' })
const runtimeHost = ref('127.0.0.1')
const runtimePort = ref('3000')
const configRaw = ref('')
const configPath = ref('')
const configAuthPath = ref('')
const configBackups = ref<string[]>([])
const selectedBackup = ref('')
const revealSecrets = ref(false)
const isRevealingSecrets = ref(false)
const isSavingConfig = ref(false)
const settingsMessage = ref('')
const settingsError = ref('')
const skills = ref<Skill[]>([])
const selectedSkillIds = ref<string[]>(loadSelectedSkills())
const skillSearchQuery = ref('')
const skillSource = ref('')
const skillName = ref('')
const isLoadingSkills = ref(false)
const isInstallingSkill = ref(false)
const skillsMessage = ref('')
const skillsError = ref('')
const plugins = ref<Record<string, any>[]>([])
const mcpServers = ref<Record<string, any>[]>([])
const integrationMessage = ref('')
const integrationError = ref('')
const promptState = reactive({ show: false, title: '', description: '', value: '' })
let promptResolver: ((value: string | null) => void) | null = null
const routeThreadId = computed(() => typeof route.params.threadId === 'string' ? route.params.threadId : '')
const isHomeRoute = computed(() => route.name === 'home')
const contentTitle = computed(() => isHomeRoute.value ? t('app.newThread') : selectedThread.value?.title || t('app.thread'))
const viewTitle = computed(() => view.value === 'chat' ? (isHomeRoute.value ? t('app.newThread') : contentTitle.value) : view.value === 'skills' ? t('app.skills') : view.value === 'integrations' ? t('app.integrations') : view.value === 'browser' ? t('app.browser') : view.value === 'files' ? t('app.files') : t('app.settings'))
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => isHomeRoute.value ? '__new-thread__' : selectedThreadId.value)
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const filteredMessages = computed(() => messages.value.filter((message) => !['turnActivity.live', 'turnError.live', 'agentReasoning.live'].includes(message.messageType || '')))
const newThreadFolderOptions = computed(() => projectGroups.value.flatMap((group) => { const cwd = group.threads[0]?.cwd?.trim() || ''; return cwd ? [{ value: cwd, label: projectDisplayNameById.value[group.projectName] || group.projectName }] : [] }))
const modeOptions = computed(() => [
  { value: 'default', label: t('mode.default') },
  { value: 'plan', label: t('mode.plan') },
])
const workspaceOptions = computed(() => newThreadFolderOptions.value.map((option) => ({ value: option.value, label: option.label })))
const wireApiOptions = computed(() => [
  { value: 'responses', label: t('settings.responses') },
  { value: 'chat_completions', label: t('settings.chat') },
])
const runtimeHostOptions = computed(() => [
  { value: '127.0.0.1', label: `${t('settings.localOnly')} (127.0.0.1)` },
  { value: '0.0.0.0', label: `${t('settings.lan')} (0.0.0.0)` },
])
const reasoningSelectOptions = computed(() => reasoningOptions.map((effort) => ({ value: effort, label: t(`effort.${effort}`) })))
const personalityOptions = computed(() => [
  { value: 'pragmatic', label: t('common.pragmatic') },
  { value: 'friendly', label: t('common.friendly') },
  { value: 'none', label: t('common.none') },
])
const backupOptions = computed(() => configBackups.value.map((backup) => ({ value: backup, label: backup })))
const selectedSkillNames = computed(() => skills.value.filter((skill) => selectedSkillIds.value.includes(skill.id)).map((skill) => skill.name))
const filteredSkills = computed(() => {
  const query = skillSearchQuery.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter((skill) => `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(query))
})
const selectedTelemetry = localTelemetry.selected(selectedThreadId)
const contextPercent = computed(() => selectedTelemetry.value.contextWindow > 0 ? Math.min(100, Math.round(selectedTelemetry.value.currentContextTokens / selectedTelemetry.value.contextWindow * 100)) : 0)
const turnStats = computed(() => {
  const telemetry = selectedTelemetry.value
  const active = telemetry.currentTurnStartedAt !== null
  return {
    total: active ? telemetry.currentTurnTotalTokens : telemetry.lastTurnTotalTokens,
    output: active ? telemetry.currentTurnOutputTokens : telemetry.lastTurnOutputTokens,
    speed: active ? telemetry.currentTurnOutputTokensPerSecond : telemetry.lastTurnOutputTokensPerSecond,
    duration: active ? telemetry.currentTurnElapsedMs : telemetry.lastTurnWorkingMs,
  }
})
const commands = computed(() => [
  { id: 'plan', label: t('command.plan'), description: t('command.planDescription') },
  { id: 'skills', label: t('command.skills'), description: t('command.skillsDescription') },
  { id: 'mcp', label: t('command.mcp'), description: t('command.mcpDescription') },
  { id: 'browser', label: t('command.browser'), description: t('command.browserDescription') },
  { id: 'settings', label: t('command.settings'), description: t('command.settingsDescription') },
  { id: 'model', label: t('slash.model'), description: t('slash.model') },
  { id: 'status', label: t('command.status'), description: t('command.statusDescription') },
  { id: 'context', label: t('command.context'), description: t('command.contextDescription') },
])
const filteredCommands = computed(() => commands.value.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(commandQuery.value.toLowerCase())))

onMounted(async () => { setViewFromRoute(); window.addEventListener('keydown', onGlobalKeydown); void checkForUpdates(true); await refreshAll(); if (routeThreadId.value) await selectThread(routeThreadId.value); startPolling(); await loadConfig(); await loadCurrentBalance(); await loadRuntime(); await loadSkills(); await loadIntegrations() })
onUnmounted(() => { window.removeEventListener('keydown', onGlobalKeydown); stopPolling() })
watch(routeThreadId, async (threadId) => { if (threadId && selectedThreadId.value !== threadId) await selectThread(threadId) })
watch(() => route.name, () => { setViewFromRoute() })
function applyAppearanceMode(value: 'codex' | 'comet' | 'midnight'): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.appearance = value
}
applyAppearanceMode(appearanceMode.value)
watch(appearanceMode, (value) => {
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, value)
  applyAppearanceMode(value)
})

function routeNameForView(nextView: ViewName): string { return nextView === 'chat' ? (selectedThreadId.value ? 'thread' : 'home') : nextView }
function setViewFromRoute(): void {
  if (route.name === 'skills' || route.name === 'settings' || route.name === 'integrations' || route.name === 'browser' || route.name === 'files') {
    view.value = route.name
    if (route.name === 'settings') {
      const tab = typeof route.query.tab === 'string' ? route.query.tab : ''
      if (tab === 'connection' || tab === 'balance' || tab === 'runtime' || tab === 'toml') settingsTab.value = tab
    }
    return
  }
  view.value = 'chat'
}
function setSettingsTab(tab: SettingsTab): void {
  settingsTab.value = tab
  if (route.name === 'settings' && route.query.tab !== tab) void router.replace({ query: { ...route.query, tab } })
}
function openView(nextView: ViewName): void { view.value = nextView; drawerOpen.value = false; const routeName = routeNameForView(nextView); if (route.name !== routeName) void router.push(nextView === 'chat' && routeName === 'thread' ? { name: routeName, params: { threadId: selectedThreadId.value } } : { name: routeName }); if (nextView === 'settings') { void loadConfig(); void loadRuntime() } if (nextView === 'skills') void loadSkills(); if (nextView === 'integrations') void loadIntegrations() }
function seedTask(kind: 'explore' | 'fix' | 'review'): void { composerSeed.value = t(`home.prompt${kind[0].toUpperCase()}${kind.slice(1)}`) }
function startNewThread(): void { void router.push({ name: 'home' }); view.value = 'chat'; drawerOpen.value = false }
function onSelectThread(threadId: string): void { drawerOpen.value = false; view.value = 'chat'; void router.push({ name: 'thread', params: { threadId } }) }
function onArchiveThread(threadId: string): void { void archiveThreadById(threadId) }
function askConfirm(content: string, title = t('common.confirm')): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    dialog.warning({
      title,
      content,
      positiveText: t('common.confirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => settle(true),
      onNegativeClick: () => settle(false),
      onClose: () => settle(false),
    })
  })
}
function openPrompt(title: string, description: string, initialValue: string, submit: (value: string) => void | Promise<void>): void {
  promptResolver?.(null)
  promptState.title = title
  promptState.description = description
  promptState.value = initialValue
  promptState.show = true
  promptResolver = (value) => {
    promptResolver = null
    promptState.show = false
    if (value !== null) void submit(value)
  }
}
function submitPrompt(): void {
  const value = promptState.value.trim()
  if (!value) return
  promptResolver?.(value)
}
function cancelPrompt(): void { promptResolver?.(null) }
function onRenameThread(payload: { threadId: string; name: string }): void { void renameThreadById(payload.threadId, payload.name) }
function onRenameRequest(payload: { threadId: string; name: string }): void { openPrompt(t('sidebar.renameThread'), t('sidebar.renameThreadDescription'), payload.name, (name) => onRenameThread({ threadId: payload.threadId, name })) }
async function onArchiveRequest(threadId: string): Promise<void> { if (await askConfirm(t('sidebar.archiveConfirm'))) onArchiveThread(threadId) }
function onStartNewThread(projectName: string): void { const group = projectGroups.value.find((item) => item.projectName === projectName); newThreadCwd.value = group?.threads[0]?.cwd || newThreadCwd.value; startNewThread() }
function onRenameProject(payload: { projectName: string; displayName: string }): void { renameProject(payload.projectName, payload.displayName) }
async function onRemoveProject(projectName: string): Promise<void> { if (await askConfirm(t('sidebar.removeProjectConfirm'))) removeProject(projectName) }
function onReorderProject(payload: { projectName: string; toIndex: number }): void { reorderProject(payload.projectName, payload.toIndex) }
async function checkForUpdates(autoInstall: boolean): Promise<void> { if (updateState.checking) return; updateState.checking = true; updateState.error = ''; try { const result = await api<{ currentVersion: string; latestVersion: string; updateAvailable: boolean }>('/api/update/check'); updateState.checked = true; updateState.current = result.currentVersion; updateState.latest = result.latestVersion; updateState.available = result.updateAvailable; if (result.updateAvailable && autoInstall && !sessionStorage.getItem('codex-web-mobile.update-attempted')) { sessionStorage.setItem('codex-web-mobile.update-attempted', result.latestVersion); updateState.installing = true; message.info(`${t('update.available')} ${result.latestVersion}`); await api('/api/update/apply', { method: 'POST', body: '{}' }); updateState.message = t('update.installed'); message.success(t('update.installed')) } } catch (unknownError) { updateState.error = unknownError instanceof Error ? unknownError.message : t('update.checkFailed'); message.warning(t('update.checkFailed')) } finally { updateState.checking = false; updateState.installing = false } }
async function onSubmitThreadMessage(text: string): Promise<void> { const attachments = [...attachedFiles.value]; try { if (isHomeRoute.value) await submitFirstMessage(text, attachments); else await sendMessageToSelectedThread(sessionMode.value === 'plan' ? '[Plan mode]\n' + text : text, attachments); attachedFiles.value = [] } catch { attachedFiles.value = attachments; composerSeed.value = text } }
async function onGuideMessage(text: string): Promise<void> { const attachments = [...attachedFiles.value]; attachedFiles.value = []; const accepted = await steerSelectedThreadTurn(text, attachments); if (!accepted) { attachedFiles.value = attachments; composerSeed.value = text } }
async function onInterruptAndSendMessage(text: string): Promise<void> { const attachments = [...attachedFiles.value]; attachedFiles.value = []; const accepted = await interruptAndSendToSelectedThread(text, attachments); if (!accepted) { attachedFiles.value = attachments; composerSeed.value = text } }
async function submitFirstMessage(text: string, attachments: UiFileAttachment[] = []): Promise<void> { const instructions = `${sessionMode.value === 'plan' ? 'Use plan mode. Start by presenting a concise plan and keep it updated.\n\n' : ''}${await getSelectedSkillInstructions()}`; const threadId = await sendMessageToNewThread(text, newThreadCwd.value, instructions, attachments); if (threadId) await router.replace({ name: 'thread', params: { threadId } }) }
async function getSelectedSkillInstructions(): Promise<string> { const selected = skills.value.filter((skill) => skill.enabled && selectedSkillIds.value.includes(skill.id)); const parts: string[] = []; for (const skill of selected) { try { parts.push(`## Skill: ${skill.name}\n${await getSkillContent(skill.id)}`) } catch { /* stale skill */ } } return parts.join('\n\n') }
function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void { setThreadScrollState(payload.threadId, payload.state) }
function onRespondServerRequest(payload: { id: number; result?: unknown; error?: { code?: number; message: string } }): void { void respondToPendingServerRequest(payload) }
function onEditMessage(payload: { text: string; attachments: UiFileAttachment[] }): void { attachedFiles.value = payload.attachments.map((attachment) => ({ ...attachment })); composerSeed.value = payload.text }
function onSelectModel(modelId: string): void { setSelectedModelId(modelId) }
function onSelectReasoningEffort(effort: ReasoningEffort | ''): void { setSelectedReasoningEffort(effort) }
function onInterruptTurn(): void { void interruptSelectedThreadTurn() }
function openFilePicker(): void { filePickerOpen.value = true; fileError.value = ''; filePreview.value = ''; if (!fileBrowserPath.value) fileBrowserPath.value = selectedThread.value?.cwd || newThreadCwd.value; void loadDirectory() }
async function loadDirectory(): Promise<void> { fileLoading.value = true; fileError.value = ''; try { const result = await api<{ path: string; parent: string; entries: Array<{ name: string; path: string; type: 'file' | 'directory'; size: number }> }>(`/api/files/list?path=${encodeURIComponent(fileBrowserPath.value)}`); fileBrowserPath.value = result.path; fileParentPath.value = result.parent === result.path ? '' : result.parent; fileEntries.value = result.entries } catch (unknownError) { fileError.value = unknownError instanceof Error ? unknownError.message : 'Failed to list directory' } finally { fileLoading.value = false } }
function openDirectory(path: string): void { fileBrowserPath.value = path; filePreview.value = ''; void loadDirectory() }
async function attachFile(entry: { name: string; path: string }): Promise<void> { const type = /\.(png|jpe?g|gif|webp|bmp)$/iu.test(entry.name) ? 'localImage' : 'mention'; if (!attachedFiles.value.some((file) => file.path === entry.path)) attachedFiles.value.push({ type, path: entry.path, name: entry.name }); if (type === 'mention') { try { const result = await api<{ content: string; truncated: boolean }>(`/api/files/read?path=${encodeURIComponent(entry.path)}`); filePreview.value = result.content + (result.truncated ? '\n\n[Preview truncated]' : '') } catch { filePreview.value = '' } } }
function removeAttachment(path: string): void { attachedFiles.value = attachedFiles.value.filter((file) => file.path !== path) }
async function uploadSelectedFile(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const files = Array.from(input.files || []); if (files.length === 0) return; fileError.value = ''; try { for (const file of files) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); const result = await api<{ path: string }>('/api/files/upload', { method: 'POST', body: JSON.stringify({ directory: fileBrowserPath.value, name: file.name, contentBase64: btoa(binary) }) }); await attachFile({ name: file.name, path: result.path }) } await loadDirectory() } catch (unknownError) { fileError.value = unknownError instanceof Error ? unknownError.message : 'Upload failed' } finally { input.value = '' } }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> { const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`); return payload as T }
async function loadConfig(reveal = revealSecrets.value): Promise<void> { try { const result = await api<ConfigResponse>(`/api/config?reveal=${reveal ? '1' : '0'}`); configPath.value = result.path; configAuthPath.value = result.authPath || ''; configRaw.value = result.raw; configBackups.value = (await api<{ data: string[] }>('/api/config/backups')).data; const config = result.config || {}; const providers = config.model_providers || {}; const providerName = String(config.model_provider || settings.providerName); const provider = providers[providerName] || {}; Object.assign(settings, { providerName, baseUrl: String(provider.base_url || ''), apiKey: String(provider.api_key || ''), model: String(config.model || ''), wireApi: String(provider.wire_api || 'responses'), reasoningEffort: String(config.model_reasoning_effort || 'xhigh'), contextWindow: String(config.model_context_window || '1050000'), personality: String(config.personality || 'pragmatic') }) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to load config' } }
async function saveStructuredConfig(): Promise<void> { if (settingsTab.value === 'runtime') { await saveRuntime(); return } isSavingConfig.value = true; settingsError.value = ''; try { const provider: Record<string, unknown> = { name: settings.providerName, base_url: settings.baseUrl, wire_api: settings.wireApi, requires_openai_auth: true }; if (settings.apiKey !== '********') provider.api_key = settings.apiKey; await api('/api/config', { method: 'PUT', body: JSON.stringify({ config: { model_provider: settings.providerName, model: settings.model, model_reasoning_effort: settings.reasoningEffort, model_context_window: Number(settings.contextWindow), personality: settings.personality, model_providers: { [settings.providerName]: provider } } }) }); await api('/api/config/apply', { method: 'POST', body: '{}' }); settingsMessage.value = t('settings.savedMessage'); await loadConfig(revealSecrets.value) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to save config' } finally { isSavingConfig.value = false } }
async function loadCurrentBalance(): Promise<void> {
  if (balanceLoading.value) return
  balanceLoading.value = true
  balanceError.value = ''
  try {
    currentBalance.value = await api<BalanceQueryResult>('/api/balance/current')
  } catch (unknownError) {
    currentBalance.value = null
    balanceError.value = unknownError instanceof Error ? unknownError.message : t('balance.queryFailed')
  } finally {
    balanceLoading.value = false
  }
}
function formatBalanceNumber(value: number): string { return new Intl.NumberFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 6 }).format(value) }
function formatBalanceTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }) }
async function loadRuntime(): Promise<void> { try { const result = await api<{ host: string; port: number }>('/api/runtime'); runtimeHost.value = result.host; runtimePort.value = String(result.port) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to load runtime settings' } }
async function saveRuntime(): Promise<void> { if (!await askConfirm(t('settings.restartConfirm'))) return; try { await api('/api/runtime', { method: 'POST', body: JSON.stringify({ host: runtimeHost.value, port: Number(runtimePort.value) }) }); settingsMessage.value = t('settings.restarting'); message.success(t('settings.restarting')) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to update runtime settings'; message.error(settingsError.value) } }
async function toggleRevealSecrets(): Promise<void> { if (isRevealingSecrets.value) return; const nextValue = !revealSecrets.value; settingsError.value = ''; if (!nextValue) { revealSecrets.value = false; await loadConfig(false); return } isRevealingSecrets.value = true; revealSecrets.value = true; await loadConfig(true); if (settingsError.value) revealSecrets.value = false; isRevealingSecrets.value = false }
async function validateRawConfig(): Promise<void> { try { await api('/api/config/validate', { method: 'POST', body: JSON.stringify({ raw: configRaw.value }) }); settingsMessage.value = t('settings.tomlValid'); settingsError.value = '' } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Invalid TOML' } }
async function saveRawConfig(): Promise<void> { try { await api('/api/config/raw', { method: 'PUT', body: JSON.stringify({ raw: configRaw.value }) }); await api('/api/config/apply', { method: 'POST', body: '{}' }); settingsMessage.value = t('settings.tomlSaved'); await loadConfig(revealSecrets.value) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to save TOML' } }
async function restoreSelectedBackup(): Promise<void> { if (!selectedBackup.value || !await askConfirm(`${t('settings.restore')} ${selectedBackup.value}?`)) return; try { await api('/api/config/restore', { method: 'POST', body: JSON.stringify({ name: selectedBackup.value }) }); await api('/api/config/apply', { method: 'POST', body: '{}' }); settingsMessage.value = t('settings.backupRestored'); message.success(t('settings.backupRestored')); await loadConfig(revealSecrets.value) } catch (unknownError) { settingsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to restore backup'; message.error(settingsError.value) } }
async function loadSkills(): Promise<void> { isLoadingSkills.value = true; try { skills.value = (await api<{ data: Skill[] }>('/api/skills')).data; selectedSkillIds.value = selectedSkillIds.value.filter((id) => skills.value.some((skill) => skill.id === id)); persistSelectedSkills() } catch (unknownError) { skillsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to load skills' } finally { isLoadingSkills.value = false } }
async function rpc<T>(method: string, params: unknown = {}): Promise<T> { return (await api<{ result: T }>('/codex-api/rpc', { method: 'POST', body: JSON.stringify({ method, params }) })).result }
async function loadIntegrations(): Promise<void> { integrationError.value = ''; try { const pluginResult = await rpc<Record<string, unknown>>('plugin/list', {}); const mcpResult = await rpc<Record<string, unknown>>('mcpServerStatus/list', { cursor: null, limit: 100, detail: 'full', threadId: selectedThreadId.value || null }); plugins.value = normalizeRows(pluginResult); mcpServers.value = normalizeRows(mcpResult) } catch (unknownError) { integrationError.value = unknownError instanceof Error ? unknownError.message : 'Failed to load integrations' } }
function normalizeRows(payload: Record<string, unknown>): Record<string, any>[] { const rows = payload.data || payload.plugins || payload.servers || payload.items; return Array.isArray(rows) ? rows.filter((row): row is Record<string, any> => row !== null && typeof row === 'object') : [] }
async function installPlugin(): Promise<void> { openPrompt(t('integrations.install'), t('integrations.pluginName'), '', async (name) => { try { await rpc('plugin/install', { pluginName: name }); integrationMessage.value = t('integrations.installRequested'); message.success(t('integrations.installRequested')); await loadIntegrations() } catch (unknownError) { integrationError.value = unknownError instanceof Error ? unknownError.message : 'Plugin install failed'; message.error(integrationError.value) } }) }
async function uninstallPlugin(plugin: Record<string, any>): Promise<void> { const name = String(plugin.name || plugin.id || ''); if (!name || !await askConfirm(`${t('request.deletePlugin')} ${name}?`)) return; try { await rpc('plugin/uninstall', { pluginName: name }); message.success(t('integrations.uninstalled')); await loadIntegrations() } catch (unknownError) { integrationError.value = unknownError instanceof Error ? unknownError.message : 'Plugin uninstall failed'; message.error(integrationError.value) } }
function onGlobalKeydown(event: KeyboardEvent): void { if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { event.preventDefault(); commandQuery.value = ''; commandOpen.value = true; setTimeout(() => commandInput.value?.focus(), 0) } }
function runFirstCommand(): void { const command = filteredCommands.value[0]; if (command) runCommand(command.id) }
function runCommand(id: string): void { commandOpen.value = false; runSlashCommand(id) }
function runSlashCommand(id: string): void { if (id === 'plan') { sessionMode.value = sessionMode.value === 'plan' ? 'default' : 'plan'; view.value = 'chat'; drawerOpen.value = false; return } if (id === 'status' || id === 'context' || id === 'model') { view.value = 'chat'; drawerOpen.value = false; quickPanel.value = id; return } if (id === 'skills') openView('skills'); else if (id === 'mcp') openView('integrations'); else if (id === 'browser') openView('browser'); else if (id === 'settings') openView('settings') }
function setSelectedModelIdFromCommand(model: string): void { setSelectedModelId(model); quickPanel.value = null }
function openBrowserUrl(): void {
  const value = browserUrl.value.trim()
  if (!value) return
  const normalized = /^https?:\/\//iu.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid')
    browserUrl.value = parsed.toString()
    browserFrameLoading.value = true
  } catch {
    message.error(t('browser.invalidUrl'))
  }
}
function openBrowserExternal(): void { if (browserUrl.value) window.open(browserUrl.value, '_blank', 'noopener,noreferrer') }
async function installSkillFromForm(): Promise<void> { if (!skillSource.value.trim() || !await askConfirm(`${t('request.installSkill')} ${skillSource.value.trim()}?`)) return; isInstallingSkill.value = true; skillsError.value = ''; try { skills.value = (await api<{ data: Skill[] }>('/api/skills/install', { method: 'POST', body: JSON.stringify({ source: skillSource.value, targetName: skillName.value }) })).data; skillSource.value = ''; skillName.value = ''; skillsMessage.value = t('skills.installed'); message.success(t('skills.installed')) } catch (unknownError) { skillsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to install skill'; message.error(skillsError.value) } finally { isInstallingSkill.value = false } }
async function toggleSkill(skill: Skill): Promise<void> { try { skills.value = (await api<{ data: Skill[] }>(`/api/skills/${encodeURIComponent(skill.id)}/${skill.enabled ? 'disable' : 'enable'}`, { method: 'POST', body: '{}' })).data } catch (unknownError) { skillsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to update skill' } }
async function deleteSkill(skill: Skill): Promise<void> { if (!await askConfirm(`${t('request.deleteSkill')} ${skill.name}?`)) return; try { skills.value = (await api<{ data: Skill[] }>(`/api/skills/${encodeURIComponent(skill.id)}`, { method: 'DELETE' })).data; selectedSkillIds.value = selectedSkillIds.value.filter((id) => id !== skill.id); persistSelectedSkills(); message.success(t('skills.deleted')) } catch (unknownError) { skillsError.value = unknownError instanceof Error ? unknownError.message : 'Failed to delete skill'; message.error(skillsError.value) } }
function loadSelectedSkills(): string[] { try { const value = JSON.parse(localStorage.getItem('codex-web-mobile.selected-skills') || '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } }
function persistSelectedSkills(): void { localStorage.setItem('codex-web-mobile.selected-skills', JSON.stringify(selectedSkillIds.value)) }
function toggleSkillSelection(skillId: string, checked: boolean): void { selectedSkillIds.value = checked ? Array.from(new Set([...selectedSkillIds.value, skillId])) : selectedSkillIds.value.filter((id) => id !== skillId); persistSelectedSkills() }
function selectAllSkills(): void { selectedSkillIds.value = Array.from(new Set([...selectedSkillIds.value, ...filteredSkills.value.map((skill) => skill.id)])); persistSelectedSkills() }
function clearSelectedSkills(): void { const visibleIds = new Set(filteredSkills.value.map((skill) => skill.id)); selectedSkillIds.value = selectedSkillIds.value.filter((id) => !visibleIds.has(id)); persistSelectedSkills() }
function formatDate(value?: string): string { return value ? new Date(value).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en') : '' }
function formatTokens(value: number): string { return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value) }
function formatSpeed(value: number): string { return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2) }
function formatDuration(value: number): string { const seconds = Math.floor(value / 1000); if (locale.value === 'zh-CN') { if (seconds < 60) return `${seconds}秒`; const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes}分 ${seconds % 60}秒` : `${Math.floor(minutes / 60)}时 ${minutes % 60}分` } if (seconds < 60) return `${seconds}s`; const minutes = Math.floor(seconds / 60); return `${minutes}m ${seconds % 60}s` }
function statusLabel(status: string): string { return t(status === 'working' ? 'status.working' : status === 'waiting' ? 'status.waiting' : status === 'failed' ? 'status.failed' : status === 'completed' ? 'status.completed' : 'status.idle') }
function planProgress(plan: Array<{ status: string }>): string { const completed = plan.filter((step) => step.status === 'completed').length; return `${completed}/${plan.length}` }
function diffStats(diff: string): string { const lines = diff.split('\n'); return `+${lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length} -${lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length}` }
function formatBytes(value: number): string { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB` }
</script>
