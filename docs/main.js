const loopSteps = {
  capture: {
    kicker: "SESSION END",
    status: "signal detected",
    icon: "scan-search",
    title: "A correction is more than a correction.",
    copy: 'When you say "keep this behavior" or "that is not verified," Chat2Skill recognizes a durable signal instead of letting it disappear with the transcript.',
    artifact: "output: memory item + candidate skill",
    terminal: [
      ["01", "signal.type", "constraint", "normal"],
      ["02", "evidence", "user correction", "normal"],
      ["03", "next", "analyze -> validate -> store", "accent"]
    ]
  },
  distill: {
    kicker: "LEARNING PIPELINE",
    status: "quality gate passed",
    icon: "wand-sparkles",
    title: "Keep the behavior, not the transcript.",
    copy: "The learning loop turns a specific moment into a reusable instruction with scope, evidence, and a clear action. Weak or duplicate candidates are discarded.",
    artifact: "output: active SKILL.md + project memory",
    terminal: [
      ["01", "candidate", "response_guard", "normal"],
      ["02", "scope", "project / current repo", "normal"],
      ["03", "status", "active", "accent"]
    ]
  },
  recall: {
    kicker: "PROMPT SUBMIT",
    status: "local retrieval complete",
    icon: "search-check",
    title: "The right context arrives before the work.",
    copy: "At the start of a new task, local retrieval searches project memory and relevant skills, then injects a compact context block without sending the prompt to the cloud.",
    artifact: "input: task query / output: ranked context",
    terminal: [
      ["01", "source", "~/.chat2skill/c2s.db", "normal"],
      ["02", "match", "3 relevant items", "normal"],
      ["03", "inject", "within token budget", "accent"]
    ]
  },
  guard: {
    kicker: "FINAL RESPONSE",
    status: "evidence rule enforced",
    icon: "shield-check",
    title: "Useful confidence has a boundary.",
    copy: "When a learned rule requires evidence-based wording, the response guard catches unsupported certainty and asks for the missing source or the next validation step.",
    artifact: "mode: strict by default / configurable",
    terminal: [
      ["01", "rule", "evidence_based_terms", "normal"],
      ["02", "check", "final assistant message", "normal"],
      ["03", "result", "continue on violation", "accent"]
    ]
  }
};

const installOptions = {
  codex: {
    label: "Install from the marketplace",
    command: "codex plugin marketplace add rxa3c/chat2skill\ncodex"
  },
  claude: {
    label: "Install from the Claude marketplace",
    command: "claude plugin marketplace add https://github.com/rxa3c/chat2skill\nclaude plugin install chat2skill@chat2skill"
  },
  harness: {
    label: "Add the local Harness bundle",
    command: "git clone https://github.com/rxa3c/chat2skill.git\ndsh plugin --profile headless add ./chat2skill"
  }
};

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderLoopStep(key) {
  const step = loopSteps[key];
  if (!step) return;

  document.querySelectorAll(".step-tab").forEach((tab) => {
    const active = tab.dataset.step === key;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  document.querySelector("#stage-kicker").textContent = step.kicker;
  document.querySelector("#stage-status").innerHTML = `<span class="status-dot"></span> ${step.status}`;
  document.querySelector("#stage-title").textContent = step.title;
  document.querySelector("#stage-copy").textContent = step.copy;
  document.querySelector("#stage-artifact").textContent = step.artifact;
  document.querySelector("#stage-icon").innerHTML = `<i data-lucide="${step.icon}" aria-hidden="true"></i>`;
  document.querySelector("#stage-terminal").innerHTML = `
    <div class="terminal-bar"><span></span><span></span><span></span><b>chat2skill / ${key}</b></div>
    ${step.terminal.map(([number, label, value, tone]) => `<div class="terminal-line"><span class="terminal-prompt">${number}</span><span>${label}</span><strong class="${tone === "accent" ? "terminal-accent" : ""}">${value}</strong></div>`).join("")}
  `;
  refreshIcons();
}

function bindNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    toggle.innerHTML = `<i data-lucide="${open ? "x" : "menu"}" aria-hidden="true"></i>`;
    refreshIcons();
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
      toggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
      refreshIcons();
    });
  });
}

function bindLoopTabs() {
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.addEventListener("click", () => renderLoopStep(tab.dataset.step));
  });
}

function bindInstallTabs() {
  const label = document.querySelector("#install-label");
  const command = document.querySelector("#install-command");

  document.querySelectorAll(".install-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const option = installOptions[tab.dataset.install];
      if (!option) return;
      document.querySelectorAll(".install-tab").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      label.textContent = option.label;
      command.textContent = option.command;
      const copyButton = document.querySelector("[data-copy]");
      copyButton.dataset.copyValue = option.command;
      copyButton.innerHTML = '<i data-lucide="copy" aria-hidden="true"></i><span>Copy</span>';
      refreshIcons();
    });
  });
}

function bindCopyButton() {
  const button = document.querySelector("[data-copy]");
  button.dataset.copyValue = installOptions.codex.command;

  button.addEventListener("click", async () => {
    const value = button.dataset.copyValue;
    try {
      await navigator.clipboard.writeText(value);
      button.innerHTML = '<i data-lucide="check" aria-hidden="true"></i><span>Copied</span>';
    } catch {
      button.innerHTML = '<i data-lucide="alert-circle" aria-hidden="true"></i><span>Select to copy</span>';
    }
    refreshIcons();
    window.setTimeout(() => {
      button.innerHTML = '<i data-lucide="copy" aria-hidden="true"></i><span>Copy</span>';
      refreshIcons();
    }, 1800);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindLoopTabs();
  bindInstallTabs();
  bindCopyButton();
  refreshIcons();
});
