(() => {
  if (typeof renderAccusingStage !== "function") return;

  const originalRenderAccusingStage = renderAccusingStage;

  renderAccusingStage = function patchedRenderAccusingStage() {
    try {
      const isUsedSpy = roomState?.phase === "accusing" &&
        playerState?.role === "spy" &&
        roomState?.advancedSpyAccusation &&
        playerState?.spyAccusationUsed &&
        !playerState?.eliminated &&
        !roomState?.teamStatus?.allSpiesFound;

      if (!isUsedSpy) {
        return originalRenderAccusingStage.apply(this, arguments);
      }

      const currentHand = roomState.currentHand;
      const alreadySubmitted = Boolean(roomState.accusations?.[playerState.id]);
      const opponentTeam = playerState.team === "black" ? "white" : "black";
      const opponentSpyFound = playerState.team === "black"
        ? roomState.teamStatus?.whiteSpyFound
        : roomState.teamStatus?.blackSpyFound;

      if (opponentSpyFound) {
        stageBox.innerHTML = `
          <div class="notice">
            第 <strong>${currentHand}</strong> 手指认节点。
            <br />
            ${TEAM_LABEL[opponentTeam]}内鬼已找出，本轮内鬼指认无需操作。
          </div>
        `;
        return;
      }

      if (alreadySubmitted) {
        stageBox.innerHTML = `
          <div class="notice">
            第 <strong>${currentHand}</strong> 手指认节点。
            <br />
            你已经提交，本轮等待其他玩家。
          </div>
        `;
        return;
      }

      stageBox.innerHTML = `
        <div class="notice">
          第 <strong>${currentHand}</strong> 手指认节点。
          <br />
          你已经使用过全局唯一一次内鬼指认机会，本轮只需选择不指认。
        </div>
        <button id="abstainButton" class="secondary">不指认</button>
      `;

      document.querySelector("#abstainButton")?.addEventListener("click", submitAbstain);
      return;
    } catch {
      return originalRenderAccusingStage.apply(this, arguments);
    }
  };

  window.setTimeout(() => {
    try {
      if (roomState) render();
    } catch {
      // 忽略补丁重绘失败，不影响主流程。
    }
  }, 0);
})();
