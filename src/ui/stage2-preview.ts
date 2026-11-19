import type { Dispatch } from '../game/contract';
import { applyCommand, getView, newGame } from '../game/engine';
import { garageScenes } from './garage-scenes';
import { mount } from './mount';
import { mountStory } from './story';
import type { StoryStep } from './story';

const steps = [
  { step: 'door' },
  { step: 'rain' },
  { step: 'dialogue', line: 0 },
  { step: 'dialogue', line: 1 },
  { step: 'dialogue', line: 2 },
  { step: 'dialogue', line: 3 },
  { step: 'dialogue', line: 4 },
  { step: 'dialogue', line: 5 },
  { step: 'rent', grant: 200, rent: 100, remaining: 100, rentalWeeks: 2 },
] as const satisfies readonly StoryStep[];

// Прогон композиции до передачи реальных примеров Stage 2.
function preview(root: HTMLElement): void {
  let cursor = 0;
  let state = newGame();
  const dispatch: Dispatch = (command) => {
    const updated = applyCommand(state, command);
    if (updated !== state) {
      state = updated;
      mount(root, getView(state), dispatch);
    }
  };

  function showStory(): void {
    const story = steps[cursor];
    if (!story) return;
    const primary = story.step === 'rent' ? 'confirmRent' : 'storyNext';
    mountStory(root, story, [primary, 'skipStory'], (action) => {
      if (action === 'storyNext') {
        cursor += 1;
        showStory();
      } else {
        mount(root, getView(state), dispatch);
        root.querySelector('button')?.focus();
      }
    });
  }

  const requested = new URLSearchParams(location.search).get('scene');
  if (requested === 'tutorial' || requested === 'workshop' || requested === 'household') {
    const scene = garageScenes[requested];
    const container = document.createElement('section');
    container.className = 'story';
    const photo = document.createElement('img');
    photo.className = 'story__image';
    photo.src = scene.image;
    photo.alt = scene.alt;
    const copy = document.createElement('div');
    copy.className = 'story__panel';
    const title = document.createElement('h1');
    title.className = 'story__title';
    title.textContent = scene.title;
    copy.append(title);
    container.append(photo, copy);
    root.replaceChildren(container);
    return;
  }

  showStory();
}

const root = document.querySelector<HTMLElement>('#app');
if (root) preview(root);
