import * as React from "react"

type ModalActivityListener = () => void

const listeners = new Set<ModalActivityListener>()
let openCount = 0

function notify() {
  listeners.forEach((listener) => listener())
}

/**
 * Track globally how many modal dialogs (Dialog/Sheet roots) are open so the
 * change-sync layer can postpone page refreshes while the operator is editing.
 */
export function subscribeModalActivity(listener: ModalActivityListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOpenModalCount() {
  return openCount
}

export function useModalsOpen() {
  const [open, setOpen] = React.useState(openCount > 0)
  React.useEffect(() => {
    const update = () => setOpen(openCount > 0)
    update()
    return subscribeModalActivity(update)
  }, [])
  return open
}

/** Register an open modal for its mount lifetime. Returns a disposer. */
export function acquireOpenModal() {
  openCount += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    openCount = Math.max(0, openCount - 1)
    notify()
  }
}
