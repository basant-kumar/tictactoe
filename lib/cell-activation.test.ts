import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createCellActivation,
  type ClickActivationEvent,
  type PointerActivationEvent,
} from './cell-activation.ts';
import { createGame, playMove } from './tic-tac-toe.ts';

type PointerFixture = PointerActivationEvent & { prevented: boolean };
type ClickFixture = ClickActivationEvent & { prevented: boolean };

type PointerOptions = Partial<
  Pick<PointerActivationEvent, 'pointerType' | 'isPrimary' | 'button'>
>;
type ClickOptions = Partial<
  Pick<ClickActivationEvent, 'pointerType' | 'detail' | 'button'>
>;

function pointerEvent(options: PointerOptions = {}): PointerFixture {
  const event: PointerFixture = {
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  Object.assign(event, options);
  return event;
}

function clickEvent(options: ClickOptions = {}): ClickFixture {
  const event: ClickFixture = {
    detail: 1,
    button: 0,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  Object.assign(event, options);
  return event;
}

function activationSpy() {
  const calls: number[] = [];
  const controller = createCellActivation((index) => calls.push(index));
  return { calls, controller };
}

void test('touch and pen activate on pointerdown without an up or click', () => {
  for (const pointerType of ['touch', 'pen']) {
    const { calls, controller } = activationSpy();
    const event = pointerEvent({ pointerType });

    controller.onPointerDown(3, event);

    assert.deepEqual(calls, [3]);
    assert.equal(event.prevented, true);
  }
});

void test('a canceled touch still commits the reducer move', () => {
  let game = createGame();
  const calls: number[] = [];
  const controller = createCellActivation((index) => {
    calls.push(index);
    game = playMove(game, index);
  });

  controller.onPointerDown(0, pointerEvent());

  assert.deepEqual(calls, [0]);
  assert.equal(game.board[0], 'X');
  assert.equal(game.currentPlayer, 'O');
  assert.equal(game.status, 'playing');
});

void test('typed and legacy compatibility clicks do not double-activate touch', () => {
  const { calls, controller } = activationSpy();

  controller.onPointerDown(0, pointerEvent());
  const typedTouchClick = clickEvent({ pointerType: 'touch' });
  controller.onClick(0, typedTouchClick);
  const legacyClick = clickEvent();
  controller.onClick(1, legacyClick);

  assert.deepEqual(calls, [0]);
  assert.equal(typedTouchClick.prevented, true);
  assert.equal(legacyClick.prevented, true);
});

void test('detail-zero keyboard input and subsequent genuine mouse input remain usable', () => {
  const { calls, controller } = activationSpy();

  controller.onPointerDown(0, pointerEvent());
  const keyboardClick = clickEvent({ detail: 0 });
  controller.onClick(1, keyboardClick);
  assert.equal(keyboardClick.prevented, false);

  controller.onPointerDown(2, pointerEvent({ pointerType: 'mouse' }));
  const untypedMouseClick = clickEvent();
  controller.onClick(2, untypedMouseClick);
  controller.onPointerDown(3, pointerEvent({ pointerType: 'mouse' }));
  const typedMouseClick = clickEvent({ pointerType: 'mouse' });
  controller.onClick(3, typedMouseClick);

  assert.deepEqual(calls, [0, 1, 2, 3]);
  assert.equal(untypedMouseClick.prevented, false);
  assert.equal(typedMouseClick.prevented, false);
});

void test('mouse down alone, right clicks, secondary contacts, and unknown pointers are ignored', () => {
  const { calls, controller } = activationSpy();
  const ignoredEvents = [
    pointerEvent({ pointerType: 'mouse' }),
    pointerEvent({ pointerType: 'mouse', button: 2 }),
    pointerEvent({ pointerType: 'touch', isPrimary: false }),
    pointerEvent({ pointerType: 'pen', isPrimary: false }),
    pointerEvent({ pointerType: 'trackpad' }),
    pointerEvent({ pointerType: 'pen', button: 2 }),
  ];

  ignoredEvents.forEach((event, index) => {
    controller.onPointerDown(index, event);
  });
  const rightClick = clickEvent({ pointerType: 'mouse', button: 2 });
  controller.onClick(0, rightClick);

  assert.deepEqual(calls, []);
  assert.equal(rightClick.prevented, false);
  assert.equal(ignoredEvents.every((event) => !event.prevented), true);
});

void test('retargeted touch and legacy clicks leave the target empty until a new gesture', () => {
  let game = createGame();
  const calls: number[] = [];
  const controller = createCellActivation((index) => {
    calls.push(index);
    game = playMove(game, index);
  });

  controller.onPointerDown(0, pointerEvent());
  controller.onClick(1, clickEvent({ pointerType: 'touch' }));
  controller.onClick(1, clickEvent());

  assert.deepEqual(calls, [0]);
  assert.equal(game.board[1], null);
  assert.equal(game.currentPlayer, 'O');

  controller.onPointerDown(1, pointerEvent());

  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(game.board.slice(0, 2), ['X', 'O']);
  assert.equal(game.currentPlayer, 'X');
});

void test('duplicate callbacks at an occupied cell are safe through playMove', () => {
  let game = createGame();
  let callbackCount = 0;
  const controller = createCellActivation((index) => {
    callbackCount += 1;
    game = playMove(game, index);
  });

  controller.onPointerDown(0, pointerEvent());
  const afterFirstMove = game;
  controller.onClick(0, clickEvent({ detail: 0 }));

  assert.equal(callbackCount, 2);
  assert.equal(game, afterFirstMove);
  assert.equal(game.board[0], 'X');
  assert.equal(game.currentPlayer, 'O');
});
