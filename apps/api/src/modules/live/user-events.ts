import { Subject } from 'rxjs'

/**
 * Pushes an event to one user's open tabs over the chat socket (the gateway subscribes).
 * Lets services such as the interview reminder reach a user without depending on the gateway.
 */
export interface UserEvent { userId: string; event: string; data: unknown }

const events = new Subject<UserEvent>()

export const pushToUser = (userId: string, event: string, data: unknown) => events.next({ userId, event, data })
export const userEvents$ = events.asObservable()
