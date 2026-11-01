// 화면 UI (버튼, 패널, 창)
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids) if (c !== null && c !== undefined) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
export { h };

export class HUD {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    root.innerHTML = '';
    this.topbar = h('div', { id: 'topbar' }, (this.badge = h('div', { id: 'room-badge' })), (this.status = h('div', { id: 'status' })));
    this.tickets = h('div', { id: 'tickets', class: 'pill' }, '🎟️ 0');
    this.side = h(
      'div',
      { id: 'side' },
      h('button', { class: 'round small', title: '지도', onclick: handlers.map }, '🗺️'),
      h('button', { class: 'round small', title: '가방', onclick: handlers.bag }, '🎒'),
      h('button', { class: 'round small', title: '앨범', onclick: handlers.album }, '🖼️'),
      (this.nightBtn = h('button', { class: 'round small', title: '밤/낮', onclick: handlers.night }, '🌙')),
      (this.soundBtn = h('button', { class: 'round small', title: '소리', onclick: handlers.sound }, '🔊')),
    );
    this.emotes = h(
      'div',
      { id: 'emotes' },
      ...[
        ['wave', '👋'],
        ['heart', '💖'],
        ['laugh', '😆'],
      ].map(([e, icon]) => h('button', { class: 'round small', onclick: () => handlers.emote(e) }, icon)),
      h('button', { class: 'round small', onclick: () => this.toggleChat() }, '💬'),
      h('button', { class: 'round small', onclick: handlers.selfie }, '📸'),
    );
    this.joystick = h('div', { id: 'joystick' }, (this.stick = h('div', { id: 'stick' })));
    this.jump = h('button', { id: 'btn-jump', class: 'round big' }, '⬆️');
    this.actions = h('div', { id: 'actions' }, this.jump);
    this.prompt = h('button', { id: 'prompt', class: 'hidden', onclick: () => handlers.prompt() });
    this.chatInput = h('input', { id: 'chat-input', maxlength: '40', placeholder: '말하기...', autocomplete: 'off' });
    this.chatForm = h(
      'form',
      {
        id: 'chat-form',
        class: 'hidden',
        onsubmit: (e) => {
          e.preventDefault();
          const text = this.chatInput.value.trim();
          if (text) handlers.chat(text);
          this.chatInput.value = '';
          this.chatInput.blur();
          this.chatForm.classList.add('hidden');
        },
      },
      this.chatInput,
      h('button', { class: 'btn primary' }, '보내기'),
    );
    // 탑승 패널
    this.rideTitle = h('div', { class: 'title' });
    this.rideStatus = h('div', { class: 'status' });
    this.ridePanelTop = h('div', { class: 'panel-top hidden' }, this.rideTitle, this.rideStatus);
    this.camBtn = h('button', { class: 'btn', onclick: handlers.rideCam }, '🎥 시점');
    this.actBtn = h('button', { class: 'btn primary', onclick: handlers.rideAction }, '🙌 만세');
    this.exitBtn = h('button', { class: 'btn', onclick: handlers.rideExit }, '내리기');
    this.ridePanelBottom = h('div', { class: 'panel-bottom hidden' }, this.camBtn, this.actBtn, this.exitBtn);
    // 게임 패널
    this.gameTitle = h('div', { class: 'title' });
    this.gameStatus = h('div', { class: 'status' });
    this.gamePanelTop = h('div', { class: 'panel-top hidden' }, this.gameTitle, this.gameStatus);
    this.gamePanelBottom = h('div', { class: 'panel-bottom hidden' }, h('button', { class: 'btn', onclick: handlers.gameStop }, '그만하기'));
    this.toastEl = h('div', { id: 'toast' });

    root.append(this.topbar, this.tickets, this.side, this.emotes, this.joystick, this.actions, this.prompt, this.chatForm, this.ridePanelTop, this.ridePanelBottom, this.gamePanelTop, this.gamePanelBottom, this.toastEl);

    this.modal = h('div', { id: 'modal', class: 'hidden', onclick: (e) => e.target === this.modal && this.closeModal() });
    this.fadeEl = h('div', { id: 'fade' });
    document.body.append(this.modal, this.fadeEl);
    this._prompt = null;
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  setTickets(n) {
    this.tickets.textContent = `🎟️ ${n}`;
  }

  toggleChat() {
    this.chatForm.classList.toggle('hidden');
    if (!this.chatForm.classList.contains('hidden')) this.chatInput.focus();
  }

  setPrompt(p) {
    const key = p ? `${p.text}|${p.hot}|${p.disabled}` : '';
    if (key === this._prompt) return;
    this._prompt = key;
    if (!p) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.textContent = p.text;
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('hot', !!p.hot);
    this.prompt.classList.toggle('disabled', !!p.disabled);
  }

  // 걷기용 버튼 보이기/숨기기
  walkMode(on, { joystick = on } = {}) {
    this.joystick.classList.toggle('hidden', !joystick);
    this.actions.classList.toggle('hidden', !on);
    this.emotes.classList.toggle('hidden', !on);
  }

  showRide(on, ride) {
    this.ridePanelTop.classList.toggle('hidden', !on);
    this.ridePanelBottom.classList.toggle('hidden', !on);
    const drive = on && ride?.mode === 'drive';
    this.ridePanelBottom.classList.toggle('drive', drive);
    this.walkMode(!on, { joystick: !on || drive });
    if (on) {
      this.rideTitle.textContent = `${ride.icon} ${ride.name}`;
      this.setPrompt(null);
    }
  }

  updateRide(status, canExit, actionLabel) {
    if (this.rideStatus.textContent !== status) this.rideStatus.textContent = status;
    this.exitBtn.disabled = !canExit;
    if (this.actBtn.textContent !== actionLabel) this.actBtn.textContent = actionLabel;
  }

  showGame(on, game) {
    this.gamePanelTop.classList.toggle('hidden', !on);
    this.gamePanelBottom.classList.toggle('hidden', !on);
    this.walkMode(!on);
    if (on) {
      this.gameTitle.textContent = `${game.icon} ${game.name} · 화면을 톡톡!`;
      this.setPrompt(null);
    }
  }

  updateGame(text, sec) {
    this.gameStatus.textContent = `${text} · ⏱ ${sec}`;
  }

  openModal(title, ...content) {
    this.modal.innerHTML = '';
    const sheet = h('div', { class: 'sheet' }, h('h2', {}, title), ...content, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.closeModal() }, '닫기')));
    this.modal.append(sheet);
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }

  get modalOpen() {
    return !this.modal.classList.contains('hidden');
  }

  async fade(fn) {
    this.fadeEl.classList.add('on');
    await new Promise((r) => setTimeout(r, 260));
    fn();
    await new Promise((r) => setTimeout(r, 60));
    this.fadeEl.classList.remove('on');
  }
}
