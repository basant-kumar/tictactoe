export interface PointerActivationEvent {
  pointerType: string;
  isPrimary: boolean;
  button: number;
  preventDefault(): void;
}

export interface ClickActivationEvent {
  pointerType?: string;
  detail: number;
  button: number;
  preventDefault(): void;
}

function isTouchOrPen(pointerType: string | undefined) {
  return pointerType === 'touch' || pointerType === 'pen';
}

export function createCellActivation(activate: (index: number) => void) {
  let suppressLegacyClick = false;

  return {
    onPointerDown(index: number, event: PointerActivationEvent) {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      if (event.pointerType === 'mouse') {
        suppressLegacyClick = false;
        return;
      }

      if (!isTouchOrPen(event.pointerType)) {
        return;
      }

      suppressLegacyClick = true;
      event.preventDefault();
      activate(index);
    },

    onClick(index: number, event: ClickActivationEvent) {
      if (event.button !== 0) {
        return;
      }

      if (isTouchOrPen(event.pointerType)) {
        event.preventDefault();
        return;
      }

      if (event.detail === 0) {
        activate(index);
        return;
      }

      if (event.pointerType === undefined && suppressLegacyClick) {
        event.preventDefault();
        return;
      }

      activate(index);
    },
  };
}
