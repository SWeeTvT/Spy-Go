(() => {
  const modal = document.querySelector("#resultModal");
  const content = document.querySelector("#resultContent");
  const confirmButton = document.querySelector("#resultConfirmButton");
  const logBox = document.querySelector("#logBox");

  if (!modal || !content || !confirmButton || !logBox) return;

  const seenKeys = new Set(loadSeenKeys());
  let initialized = false;
  let isOpen = false;
  let collectTimer = null;
  const queue = [];

  window.setTimeout(() => {
    markCurrentResultsSeen();
    initialized = true;
  }, 1200);

  const observer = new MutationObserver(() => {
    if (!initialized) {
      markCurrentResultsSeen();
      return;
    }

    window.clearTimeout(collectTimer);
    collectTimer = window.setTimeout(collectNewResults, 180);
  });

  observer.observe(logBox, {
    childList: true,
    subtree: true
  });

  confirmButton.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    isOpen = false;
    showNextResultModal();
  });

  function collectNewResults() {
    const newResults = getCurrentResultTexts()
      .filter((text) => isAccusationResultText(text))
      .filter((text) => {
        const key = createResultKey(text);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

    if (newResults.length === 0) {
      saveSeenKeys();
      return;
    }

    saveSeenKeys();

    // 日志区是倒序显示的，所以弹窗内反转为正常发生顺序；
    // 同一轮短时间内产生的多条结果合并到同一个弹窗，避免只显示其中一条。
    queue.push(newResults.reverse());
    showNextResultModal();
  }

  function showNextResultModal() {
    if (isOpen || queue.length === 0) return;

    const texts = queue.shift();
    content.innerHTML = texts
      .map((text) => `<div class="result-modal-line">${escapeHtml(text)}</div>`)
      .join("");

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    isOpen = true;
    confirmButton.focus();
  }

  function markCurrentResultsSeen() {
    getCurrentResultTexts().forEach((text) => {
      if (isAccusationResultText(text)) {
        seenKeys.add(createResultKey(text));
      }
    });
    saveSeenKeys();
  }

  function getCurrentResultTexts() {
    return Array.from(logBox.querySelectorAll(".result-log"))
      .map((node) => node.textContent.trim())
      .filter(Boolean);
  }

  function isAccusationResultText(text) {
    return (
      /^第\s*(50|100|150)\s*手：/.test(text) ||
      /^150\s*手终局指认奖励：/.test(text) ||
      /^内鬼已全部找出/.test(text) ||
      /^第\s*150\s*手指认环节结束/.test(text)
    );
  }

  function createResultKey(text) {
    const room = new URLSearchParams(window.location.search).get("room") || "NO_ROOM";
    return `${room}::${text}`;
  }

  function loadSeenKeys() {
    try {
      return JSON.parse(sessionStorage.getItem("spy-go-seen-result-logs") || "[]");
    } catch {
      return [];
    }
  }

  function saveSeenKeys() {
    try {
      sessionStorage.setItem("spy-go-seen-result-logs", JSON.stringify(Array.from(seenKeys).slice(-160)));
    } catch {
      // 忽略浏览器存储异常，不影响游戏流程。
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
