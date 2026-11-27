import { contactStatus } from '../game/phone';
import type { PhoneChoice } from '../game/phone';
import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import { actionButton, element, rubles } from './dom';
import './phone.css';

type App = 'home' | 'chat' | 'calls' | 'meetings' | 'contacts';
const names: Record<App, string> = { home: 'Телефон', chat: 'Переписка', calls: 'Звонки', meetings: 'Встречи', contacts: 'Контакты' };
const playerLines: Partial<Record<PhoneChoice, string>> = {
  reply: 'Спасибо, что спросила. Расскажу, когда увидимся.', text: 'Привет! Как твой день?',
  call: 'Есть минутка поговорить?', answer: 'Привет, теперь могу говорить.',
  declineCall: 'Сегодня не получится созвониться.', apologize: 'Прости, что не предупредил.',
};

export function createPhone(root: HTMLElement, dispatch: Stage7Dispatch) {
  const dialog = element('dialog', 'game-phone');
  dialog.setAttribute('aria-labelledby', 'game-phone-title');
  root.after(dialog);
  let view: Stage7View;
  let app: App = 'home';
  let error = '';
  let pendingSale = false;

  function render(focus?: string) {
    const { phone, calendar, screen } = view;
    const revision = screen.revision;
    const button = (label: string, key: string, run: () => void, primary = false) => {
      const control = actionButton(label, primary ? 'garage__button garage__button--primary' : 'garage__button', run);
      control.dataset.phoneKey = key;
      return control;
    };
    const send = (label: string, choice: PhoneChoice, allowed = true, target?: number, primary = false) => {
      const control = button(label, choice, () =>
        dispatch({ type: 'phone', choice, ...(target === undefined ? {} : { target }), expectedRevision: revision }), primary);
      control.disabled = !allowed;
      return control;
    };
    const open = (next: App) => {
      app = next;
      pendingSale = false;
      error = '';
      render('title');
    };
    const go = (room: 'auctions' | 'market' | 'inbox') => {
      dialog.close();
      dispatch({ type: 'navigate', room, expectedRevision: revision });
    };
    const title = element('h2', '', names[app]);
    title.id = 'game-phone-title';
    title.tabIndex = -1;
    title.dataset.phoneKey = 'title';
    const header = element('header', 'game-phone__header');
    if (app !== 'home') header.append(button('Назад', 'back', () => open('home')));
    header.append(title, button('Закрыть', 'close', () => dialog.close()));
    const status = element('p', 'game-phone__status', `${calendar.weekday} · день ${calendar.day}`);
    const panel = element('section', 'game-phone__screen');
    const stack = element('div', 'game-phone__stack');
    panel.append(stack);
    const note = (line: string) => stack.append(element('p', 'game-phone__note', line));

    if (app === 'home') {
      const summary = element('section', 'game-phone__summary');
      const meter = element('progress', '');
      meter.max = 100;
      meter.value = phone.score;
      meter.setAttribute('aria-label', 'Отношения с соседкой');
      summary.append(element('strong', '', phone.known ? `${phone.tier} · ${phone.score} / 100` : 'Знакомство с соседкой'), meter,
        element('p', '', `Социальный рейтинг ${phone.status} · продавец ${phone.sellerRating ? phone.sellerRating + ' ★' : 'без оценок'}`));
      stack.append(summary);
      if (phone.call && !phone.call.hidden) stack.append(button('Входящий звонок от соседки', 'incoming', () => open('calls'), true));
      if (phone.meeting) stack.append(button('Запланированная встреча', 'agenda', () => open('meetings')));
      const apps = element('nav', 'game-phone__apps');
      apps.setAttribute('aria-label', 'Приложения');
      function tile(label: string, key: string, icon: string, run: () => void) {
        const control = button('', key, run);
        const symbol = element('span', 'game-phone__icon', icon);
        symbol.setAttribute('aria-hidden', 'true');
        control.append(symbol, element('span', '', label));
        apps.append(control);
      }
      tile(phone.unread ? `Соседка (${phone.unread})` : 'Соседка', 'chat', '✉', () => open('chat'));
      tile('Звонки', 'calls', '☎', () => open('calls'));
      tile('Встречи', 'meetings', '◷', () => open('meetings'));
      tile('Контакты', 'contacts', '◎', () => open('contacts'));
      tile('Аукционы', 'auctions', '▥', () => go('auctions'));
      tile('Объявления', 'market', '▤', () => go('market'));
      tile('Покупатели', 'inbox', '▣', () => go('inbox'));
      stack.append(apps);
    }
    if (app === 'chat') {
      if (!phone.known) {
        note(phone.canMeetNeighbor ? 'Соседка дома. Можно зайти познакомиться.' : 'Знакомство откроется при 8 очках социального рейтинга.');
        const meet = button('Познакомиться', 'meet', () => {
          dialog.close();
          dispatch({ type: 'openRelationship', expectedRevision: revision });
        }, true);
        // The existing introduction is available from the yard and the auction hub.
        meet.disabled = !phone.canMeetNeighbor || !['home', 'hub'].includes(screen.phase);
        if (phone.canMeetNeighbor && meet.disabled) note('Открой телефон во дворе или между торгами.');
        stack.append(meet);
      } else {
        const history = element('div', 'game-phone__chat');
        history.setAttribute('aria-label', 'Переписка с соседкой');
        for (const message of phone.messages.slice(-12)) {
          const player = message.choice ? playerLines[message.choice] : undefined;
          if (player) history.append(element('p', 'game-phone__bubble game-phone__bubble--me', player));
          history.append(element('p', 'game-phone__bubble', message.text));
        }
        if (history.childElementCount) stack.append(history);
        else note('Здесь будут ваши сообщения.');
        const latest = phone.messages.at(-1);
        if (phone.unread) stack.append(send('Отметить прочитанным', 'read', true, latest?.id));
        if (phone.canReply) stack.append(send('Ответить', 'reply', true, latest?.id, true));
        else if (phone.canText) stack.append(send('Спросить, как день', 'text', true, undefined, true));
        if (phone.conflict) {
          note('Ты пропустил договорённость. Можно объясниться.');
          stack.append(send('Извиниться', 'apologize', true, undefined, true));
        }
        if (phone.canMutual) {
          note('«Мне кажется, между нами что-то есть. У тебя тоже?»');
          stack.append(send('Да, это взаимно', 'mutual', true, undefined, true));
          stack.append(button('Продолжить как друзья', 'stay', () => open('meetings')));
        }
        if (phone.canCommit) {
          note('«Мне хорошо с тобой. Хочешь, чтобы мы были вместе?»');
          stack.append(send('Да, хочу быть вместе', 'commit', true, undefined, true));
        }
        if (phone.canFriendship) stack.append(send('Предложить остаться друзьями', 'friendship'));
      }
    }
    if (app === 'calls') {
      if (phone.call) {
        const { id, due, promised, hidden, text } = phone.call;
        const incoming = element('div', 'game-phone__call');
        const avatar = element('span', 'game-phone__caller', '☎');
        avatar.setAttribute('aria-hidden', 'true');
        incoming.append(avatar, element('strong', '', 'Соседка'), element('p', 'game-phone__note', text));
        stack.append(incoming);
        note(due === null ? 'Звонок будет доступен после возвращения.' : `Соседка ждёт звонка до конца дня ${due}.`);
        stack.append(send(hidden ? 'Перезвонить' : 'Ответить', 'answer', due !== null, id, true));
        if (!hidden) stack.append(send('Пропустить звонок', 'skipCall', due !== null, id));
        if (!promised) stack.append(send('Пообещать перезвонить завтра', 'callBackLater', due !== null, id));
        stack.append(send('Предупредить, что занят', 'declineCall', due !== null, id));
      } else {
        note(phone.known ? 'Пропущенных звонков нет.' : 'Познакомься с соседкой, чтобы ей позвонить.');
        stack.append(send('Позвонить соседке', 'call', phone.canCall, undefined, true));
      }
    }
    if (app === 'meetings') {
      const meeting = phone.meeting;
      if (meeting) {
        note(`${meeting.kind === 'walk' ? 'Прогулка' : 'Кино'} · день ${meeting.day}`);
        if (meeting.kind === 'cinema') note(`Билет ${rubles(phone.cinemaPrice)}. Нужен свободный выезд.`);
        stack.append(send('Пойти на встречу', 'attend', phone.canAttend, meeting.id, true),
          send('Перенести на завтра', 'reschedule', !meeting.moved, meeting.id),
          send('Отменить и предупредить', 'cancel', true, meeting.id));
      } else if (phone.canBook) {
        stack.append(send('Договориться о прогулке · бесплатно', 'bookWalk', true, undefined, true),
          send(`Договориться о кино · ${rubles(phone.cinemaPrice)}`, 'bookCinema', phone.canCinema));
        if (!phone.canCinema) note('Для кино нужны деньги на билет, 8 очков рейтинга и свободный выезд.');
      } else note(phone.conflict ? 'Сначала обсудите пропущенную договорённость в переписке.' :
        !phone.known ? 'Сначала познакомься с соседкой.' :
          'Для новой встречи нужны дружеские отношения и свободный день.');
    }
    if (app === 'contacts') {
      if (!phone.contact) {
        note(`Лера откроется через близкие отношения или при ${contactStatus} очках социального рейтинга.`);
        stack.append(send('Познакомиться с Лерой', 'introduce', phone.canIntroduce, undefined, true));
      } else {
        stack.append(element('strong', '', 'Лера · коллекционер'));
        if (!phone.order) note('Ищет исправный проигрыватель. Сообщение появится, если подходящая находка будет в гараже.');
        else {
          const { id, itemName, price, due } = phone.order;
          note(`«${itemName}» · предлагаю ${rubles(price)}. Заказ открыт до конца дня ${due}.`);
          if (pendingSale) stack.append(send(`Подтвердить продажу за ${rubles(price)}`, 'sell', phone.canSell, id, true),
            button('Отмена', 'cancel-sale', () => { pendingSale = false; render('offer'); }));
          else {
            const sell = button('Продать Лере', 'offer', () => { pendingSale = true; render('sell'); }, true);
            sell.disabled = !phone.canSell;
            stack.append(sell);
          }
        }
      }
    }
    if (error) {
      const feedback = element('p', 'hub__reason', error);
      feedback.setAttribute('role', 'alert');
      stack.append(feedback);
    }
    dialog.replaceChildren(header, status, panel);
    if (app === 'chat') {
      const chat = panel.querySelector('.game-phone__chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }
    if (focus) (dialog.querySelector<HTMLElement>(`[data-phone-key="${focus}"]:not([disabled])`) ?? title).focus();
  }

  dialog.addEventListener('close', () => {
    pendingSale = false;
    error = '';
    root.querySelector<HTMLElement>('.game-phone-trigger')?.focus({ preventScroll: true });
  });
  return {
    update(next: Stage7View) {
      view = next;
      if (!view.phone.available) {
        if (dialog.open) dialog.close();
        return;
      }
      const trigger = actionButton('Телефон', 'game-phone-trigger', () => {
        app = 'home';
        render();
        dialog.showModal();
        dialog.querySelector<HTMLElement>('[data-phone-key="close"]')?.focus();
      });
      const count = view.phone.unread + (view.phone.call && !view.phone.call.hidden ? 1 : 0);
      trigger.setAttribute('aria-haspopup', 'dialog');
      if (count) {
        trigger.append(element('span', 'game-phone-trigger__count', String(count)));
        trigger.setAttribute('aria-label', `Телефон · новых уведомлений ${count}`);
      }
      (root.querySelector('.yard-footer') ?? root.firstElementChild)?.append(trigger);
      if (dialog.open) {
        const active = (document.activeElement as HTMLElement)?.dataset.phoneKey;
        error = '';
        pendingSale = false;
        if (active === 'call' || active === 'answer' || active === 'declineCall') app = 'chat';
        render(active ?? 'title');
      }
    },
    error(message: string) {
      if (!dialog.open) return;
      error = message;
      render((document.activeElement as HTMLElement)?.dataset.phoneKey ?? 'title');
    },
  };
}
