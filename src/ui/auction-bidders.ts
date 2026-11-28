import type { AuctionOpponentView, Stage3AuctionView } from '../game/stage3-contract';
import irina from './assets/bidder-irina.jpg';
import lev from './assets/bidder-lev.jpg';
import marina from './assets/bidder-marina.jpg';
import oleg from './assets/bidder-oleg.jpg';
import playerPortrait from './assets/bidder-player.jpg';
import semyon from './assets/bidder-semyon.jpg';
import viktor from './assets/bidder-viktor.jpg';
import viktoria from './assets/bidder-viktoria.jpg';
import { element, rubles } from './dom';

const portraits: Record<string, string> = {
  Ирина: irina, Лев: lev, Марина: marina, Олег: oleg, Семён: semyon, Виктор: viktor, Виктория: viktoria,
};
const calls = ['Я!', 'Деньги!', 'Здесь!'] as const;

function bidderRow(name: string, photo?: string) {
  const row = element('li', 'auction-bidder');
  const portrait = element('div', 'auction-bidder__portrait');
  if (photo) {
    const image = element('img', '');
    image.src = photo;
    image.alt = '';
    portrait.append(image);
  } else {
    const initial = element('span', '', name.charAt(0));
    initial.setAttribute('aria-hidden', 'true');
    portrait.append(initial);
  }
  portrait.append(element('strong', '', name));
  const speech = element('span', 'auction-bidder__speech');
  row.append(portrait, speech);
  return { row, speech };
}

export function auctionCast(view: Extract<Stage3AuctionView, { phase: 'inspection' | 'bidding' }>) {
  const sidebar = element('aside', 'auction-bidders');
  sidebar.setAttribute('aria-label', 'Участники торгов');
  sidebar.append(element('h2', '', 'Участники'));
  const list = element('ul', '');
  sidebar.append(list);

  const opponents: readonly AuctionOpponentView[] = view.opponents ?? (view.phase === 'bidding'
    ? [{ name: view.leaderName, amount: view.currentPrice, state: 'leading' }] : []);
  const rows = opponents.map((opponent) => {
    const { name, amount, state } = opponent;
    const { row, speech } = bidderRow(name, portraits[name]);
    row.dataset.bidderState = state;
    speech.textContent = amount === null ? (state === 'out' ? 'Пас' : '') : rubles(amount);
    list.append(row);
    return { opponent, row, speech };
  });
  const player = bidderRow('Вы', playerPortrait);
  player.row.classList.add('auction-bidder--player');
  player.speech.textContent = view.phase === 'bidding' ? rubles(view.lastPlayerBid) : '';
  list.append(player.row);

  const prompt = element('div', 'auctioneer');
  const line = element('p', '');
  line.setAttribute('role', 'status');
  const next = view.phase === 'inspection' ? `Начинаем с ${rubles(view.nextBidAmount)}.`
    : `Кто даст ${rubles(view.nextBidAmount)}?`;
  line.textContent = next;
  prompt.append(element('span', '', 'Ведущий'), line);

  function play(done: () => void): void {
    const steps: { run: () => void; duration: number }[] = [];
    const replying = rows.filter(({ opponent }) => opponent.amount !== null);
    if (view.phase !== 'bidding' || !replying.length) {
      done();
      return;
    }
    for (const { row, speech } of replying) {
      row.dataset.bidderState = 'waiting';
      speech.textContent = '—';
    }
    const playerBid = view.lastPlayerBid;
    line.textContent = `Принято, ${rubles(playerBid)}.`;
    replying.forEach(({ row, speech, opponent }, index) => {
      const amount = opponent.amount!;
      steps.push(
        { run: () => { line.textContent = `Кто даст ${rubles(amount)}?`; }, duration: 380 },
        { run: () => {
          row.dataset.bidderState = 'speaking';
          speech.textContent = calls[(playerBid + index) % calls.length]!;
        }, duration: 610 },
        { run: () => {
          row.dataset.bidderState = 'bid';
          speech.textContent = rubles(amount);
        }, duration: 310 },
      );
    });
    function advance(index: number): void {
      if (!sidebar.isConnected) return;
      const step = steps[index];
      if (step) {
        step.run();
        window.setTimeout(() => advance(index + 1), step.duration);
        return;
      }
      for (const { row, opponent } of replying) row.dataset.bidderState = opponent.state;
      line.textContent = next;
      done();
    }
    window.setTimeout(() => advance(0), 360);
  }

  return { sidebar, prompt, play };
}
