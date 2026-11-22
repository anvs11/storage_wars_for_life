export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const rubleFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function rubles(amount: number): string {
  return `${amount < 0 ? '−' : ''}${rubleFormat.format(Math.abs(amount))} ₽`;
}

export function bankFor(amount: number): HTMLParagraphElement {
  const bank = element('p', 'garage__bank');
  bank.append(element('span', '', 'Банк'), element('strong', '', rubles(amount)));
  return bank;
}

export function actionButton(label: string, className: string, activate: () => void): HTMLButtonElement {
  const control = element('button', className, label);
  control.type = 'button';
  control.addEventListener('click', activate);
  control.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  return control;
}

export function addFact(list: HTMLDListElement, label: string, value: string): void {
  const row = element('div', 'garage__fact');
  row.append(element('dt', '', label), element('dd', '', value));
  list.append(row);
}


export function replaceScreen(root: HTMLElement, screen: HTMLElement, heading: HTMLElement): void {
  const active = document.activeElement;
  const restoreFocus = root.contains(active);
  const key = active?.getAttribute('data-screen-focus');
  const target = key && Array.from(screen.querySelectorAll<HTMLElement>('[data-screen-focus]'))
    .find((control) => control.dataset.screenFocus === key);
  root.replaceChildren(screen);
  if (restoreFocus) (target || heading).focus();
}
