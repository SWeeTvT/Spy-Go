const SPY_GO_RULES_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1054" height="1492" viewBox="0 0 1054 1492">
  <rect width="1054" height="1492" fill="#f7f6f1"/>
  <text x="527" y="90" text-anchor="middle" font-size="62" font-weight="900" fill="#111">趣味围棋｜内鬼模式</text>
  <text x="527" y="145" text-anchor="middle" font-size="30" font-weight="700" fill="#111">6 人 3V3 联棋，每队随机 1 名内鬼，其余 2 人为忠臣</text>
  <text x="527" y="198" text-anchor="middle" font-size="30" font-weight="900" fill="#064b26">核心体验：下棋 + 推理 + 演技</text>

  <rect x="40" y="245" width="974" height="590" rx="22" fill="none" stroke="#0b3d24" stroke-width="2"/>
  <rect x="240" y="222" width="574" height="58" rx="8" fill="#064b26"/>
  <text x="527" y="262" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">一、核心流程与规则</text>

  <g font-size="24" fill="#111" font-weight="800">
    <text x="85" y="330">1 身份配置</text>
    <text x="330" y="330">2 指认节点</text>
    <text x="555" y="330">3 指认规则</text>
    <text x="820" y="330">4 150 手终局</text>
  </g>

  <g font-size="20" fill="#111">
    <text x="70" y="390">黑方：2 忠臣 + 1 内鬼</text>
    <text x="70" y="435">白方：2 忠臣 + 1 内鬼</text>
    <text x="70" y="485">忠臣目标：让本队最终胜率更高</text>
    <text x="70" y="535">内鬼目标：隐藏身份不被找出，</text>
    <text x="70" y="565">并尽量让本队最终胜率低</text>

    <text x="295" y="390">第 50、100、150 手结束后开放指认</text>
    <text x="295" y="445">由裁判或系统自动发起</text>
    <text x="295" y="500">采用全盲指认，由裁判或系统计票</text>
    <text x="295" y="555">内鬼在本环节的选择无效，不参与判定</text>

    <text x="535" y="380">每个指认节点，两名忠臣可选择：</text>
    <text x="535" y="410">指认为鬼 或 放弃指认</text>
    <text x="535" y="470">两名忠臣都指认且都指对：</text>
    <text x="535" y="500">指认成功，内鬼出局，棋局继续</text>
    <text x="535" y="560">两名忠臣都指认但有一人指错：</text>
    <text x="535" y="590">指认失败，本队忠臣判负，对方 3 人获胜</text>
    <text x="535" y="650">任一忠臣放弃指认：</text>
    <text x="535" y="680">本轮指认无效，棋局继续</text>
    <text x="535" y="740">仅适用于 150 手终局指认：</text>
    <text x="535" y="770">若指认成功，己方 +10 胜率，对方 -10 胜率</text>

    <text x="805" y="390">若无人成功指认，棋局在 150 手结束后自动终局</text>
    <text x="805" y="455">由 AI 胜率判定结果：</text>
    <text x="805" y="510">本方 AI 胜率更高：</text>
    <text x="805" y="540">本方忠臣胜，本方内鬼败</text>
    <text x="805" y="600">本方 AI 胜率更低：</text>
    <text x="805" y="630">本方忠臣败，本方内鬼胜</text>
  </g>

  <rect x="40" y="890" width="974" height="310" rx="22" fill="none" stroke="#0b3d24" stroke-width="2"/>
  <rect x="285" y="862" width="484" height="58" rx="8" fill="#064b26"/>
  <text x="527" y="902" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">二、角色胜负与玩法重点</text>

  <g font-size="21" fill="#111">
    <text x="155" y="985" font-weight="900">忠臣</text>
    <text x="145" y="1035">胜利条件：终局时本方 AI 胜率更高，</text>
    <text x="145" y="1065">或对方忠臣指认失败</text>
    <text x="145" y="1125">失败条件：本方指认失败，</text>
    <text x="145" y="1155">或终局时本方 AI 胜率更低</text>

    <text x="670" y="985" font-weight="900">内鬼</text>
    <text x="600" y="1035">胜利条件：不被成功指认，</text>
    <text x="600" y="1065">并让本方 AI 胜率更低或本方忠臣指认失败</text>
    <text x="600" y="1125">失败条件：被本方忠臣成功指认，</text>
    <text x="600" y="1155">或终局时本方 AI 胜率更高</text>
  </g>

  <rect x="40" y="1240" width="974" height="155" rx="22" fill="none" stroke="#0b3d24" stroke-width="2"/>
  <rect x="360" y="1210" width="334" height="58" rx="8" fill="#064b26"/>
  <text x="527" y="1250" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">三、玩法看点</text>
  <g font-size="23" fill="#111" font-weight="700">
    <text x="115" y="1325">忠臣：抓对内鬼，AI 接管，局势可能瞬间反转</text>
    <text x="115" y="1370">内鬼：下好棋不难，难的是坏得像正常失误</text>
    <text x="620" y="1325">爆点：50、100、150 手首轮指认可能翻盘</text>
    <text x="620" y="1370">没人抓对，150 手看胜率</text>
  </g>

  <rect x="0" y="1432" width="1054" height="60" fill="#064b26"/>
  <text x="527" y="1472" text-anchor="middle" font-size="26" font-weight="900" fill="#fff">抓对，AI 带飞；抓错，全队爆炸；没人抓，150 手看胜率。</text>
</svg>`;

window.SPY_GO_RULES_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(SPY_GO_RULES_SVG)}`;
