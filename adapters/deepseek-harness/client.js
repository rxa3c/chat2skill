/* Prebuilt dsh.client closure for the Chat2Skill sidebar control. */
window.__ModuleLoader__.load({
  id: 'chat2skill-plugin-runtime',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const {
      IconCordisPluginOutline14,
      IconPauseOutline16,
      IconPlayOutline16,
      Tooltip,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const SETTINGS_NAMESPACE = 'chat2skill'
    const LOCALE_NAMESPACE = 'chat2skill'
    const STYLE_MARKER = 'chat2skill-sidebar-style'

    const zh = {
      title: 'Chat2Skill',
      open: '打开 Chat2Skill 控制面板',
      close: '关闭 Chat2Skill 控制面板',
      running: '运行中',
      paused: '已暂停',
      loading: '正在读取配置',
      unavailable: '当前连接不支持远程控制',
      pause: '暂停插件',
      resume: '启用插件',
      saving: '正在更新',
      failure: '配置更新失败',
    }
    const en = {
      title: 'Chat2Skill',
      open: 'Open Chat2Skill controls',
      close: 'Close Chat2Skill controls',
      running: 'Running',
      paused: 'Paused',
      loading: 'Reading settings',
      unavailable: 'Remote control is unavailable',
      pause: 'Pause plugin',
      resume: 'Enable plugin',
      saving: 'Updating',
      failure: 'Failed to update settings',
    }

    const CSS = `
[data-chat2skill-root] {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  width: 100%;
  height: 49px;
  margin: 8px 0 0;
}
[data-chat2skill-root][data-rail="true"] {
  width: 36px;
  height: 36px;
  margin: 0;
}
[data-chat2skill-trigger] {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 49px;
  padding: 0 8px 0 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  overflow: hidden;
}
[data-chat2skill-trigger]:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid);
}
[data-chat2skill-trigger][data-open="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-chat2skill-root][data-rail="true"] [data-chat2skill-trigger] {
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
}
[data-chat2skill-label] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-chat2skill-status] {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
}
[data-chat2skill-status="paused"] {
  background: var(--dsw-alias-label-tertiary);
}
[data-chat2skill-status="loading"] {
  background: var(--dsw-alias-state-warn-primary);
}
[data-chat2skill-root][data-rail="true"] [data-chat2skill-status] {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 7px;
  height: 7px;
  border: 2px solid var(--dsw-specific-sidebar-fill);
}
[data-chat2skill-panel] {
  position: fixed;
  left: 12px;
  bottom: 128px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 320px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  box-shadow: var(--dsw-shadow-lv2);
  color: var(--dsw-alias-label-primary);
}
[data-chat2skill-panel-header] {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}
[data-chat2skill-panel-title] {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
[data-chat2skill-panel-state] {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-chat2skill-panel-note] {
  margin: 8px 0 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-chat2skill-action] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
[data-chat2skill-action]:hover:not(:disabled) {
  background: var(--dsw-alias-button-floating-hover);
}
[data-chat2skill-action]:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
[data-chat2skill-error] {
  margin: 8px 0 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
`

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      if (document.querySelector('style[data-chat2skill-style]') !== null) return () => {}
      const style = document.createElement('style')
      style.dataset.chat2skillStyle = STYLE_MARKER
      style.textContent = CSS
      document.head.appendChild(style)
      return () => { style.remove() }
    }

    function Chat2SkillPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key => key)
      const snapshot = typeof props.useSettings === 'function'
        ? props.useSettings(value => value)
        : { status: 'unavailable', value: undefined, writable: false }
      const [open, setOpen] = React.useState(false)
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState('')
      const configuredEnabled = snapshot?.value && typeof snapshot.value.enabled === 'boolean'
        ? snapshot.value.enabled
        : true
      const enabled = configuredEnabled
      const ready = snapshot?.status === 'ready' && snapshot.writable === true
      const loading = snapshot?.status === 'loading'
      const canControl = ready && typeof props.setEnabled === 'function' && !pending
      const stateKey = loading ? 'loading' : enabled ? 'running' : 'paused'
      const stateLabel = loading ? t('loading') : enabled ? t('running') : t('paused')
      const toggle = async () => {
        if (!canControl) return
        setPending(true)
        setError('')
        try {
          await props.setEnabled(!enabled)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setPending(false)
        }
      }

      const triggerIcon = enabled
        ? React.createElement(IconPauseOutline16, { size: 16 })
        : React.createElement(IconPlayOutline16, { size: 16 })
      const trigger = React.createElement('button', {
        type: 'button',
        'data-chat2skill-trigger': true,
        'data-open': open ? 'true' : 'false',
        'aria-expanded': open,
        'aria-label': open ? t('close') : t('open'),
        onClick: () => { setOpen(value => !value) },
      }, [
        React.createElement('span', { key: 'icon', 'aria-hidden': true }, triggerIcon),
        React.createElement('span', { key: 'status', 'data-chat2skill-status': stateKey, 'aria-hidden': true }),
        props.wide ? React.createElement('span', { key: 'label', 'data-chat2skill-label': true }, t('title')) : null,
      ])

      const panel = open ? React.createElement('section', {
        key: 'panel',
        'data-chat2skill-panel': true,
        'aria-label': t('title'),
      }, [
        React.createElement('div', { key: 'header', 'data-chat2skill-panel-header': true }, [
          React.createElement(IconCordisPluginOutline14, { key: 'icon', size: 16, 'aria-hidden': true }),
          React.createElement('strong', { key: 'title', 'data-chat2skill-panel-title': true }, t('title')),
          React.createElement('span', { key: 'state', 'data-chat2skill-panel-state': true, 'aria-live': 'polite' }, stateLabel),
        ]),
        React.createElement('p', { key: 'note', 'data-chat2skill-panel-note': true },
          loading ? t('loading') : snapshot?.status === 'unavailable' ? t('unavailable') : stateLabel),
        React.createElement('button', {
          key: 'action',
          type: 'button',
          'data-chat2skill-action': true,
          disabled: !canControl,
          'aria-busy': pending,
          onClick: toggle,
        }, [
          enabled
            ? React.createElement(IconPauseOutline16, { key: 'icon', size: 16, 'aria-hidden': true })
            : React.createElement(IconPlayOutline16, { key: 'icon', size: 16, 'aria-hidden': true }),
          pending ? t('saving') : enabled ? t('pause') : t('resume'),
        ]),
        error ? React.createElement('p', { key: 'error', role: 'alert', 'data-chat2skill-error': true }, `${t('failure')}: ${error}`) : null,
      ]) : null

      return React.createElement('div', {
        'data-chat2skill-root': true,
        'data-rail': props.wide ? 'false' : 'true',
      }, [
        panel,
        React.createElement(Tooltip, {
          key: 'tooltip',
          label: t('title'),
          side: 'right',
          delayMs: 500,
          disabled: props.wide,
        }, trigger),
      ])
    }

    module.exports = {
      name: 'chat2skill-plugin-runtime',
      inject: ['slots', 'locale', 'connection', 'remote', 'settingsScope'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'chat2skill: dictionaries')
        ctx.effect(installStyles, 'chat2skill: sidebar styles')
        const settings = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'chat2skill',
          order: 20,
          locale: LOCALE_NAMESPACE,
          inject: () => ({
            hooks: { settings },
            setEnabled: enabled => settings.set('enabled', enabled),
          }),
        }, Chat2SkillPanel))
      },
    }
    return module.exports
  },
})
