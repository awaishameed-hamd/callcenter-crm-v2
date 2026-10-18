import { Subject, asyncScheduler } from 'rxjs'
import { share, throttleTime } from 'rxjs/operators'

const writes = new Subject<void>()

/** Called by PrismaService after every write to the customers (sales) table. */
export const notifySalesChanged = () => writes.next()

/**
 * One tick at most per second, sent a second after the first write so the transaction behind it
 * has committed before browsers refetch. Shared by every open stream.
 */
export const salesChanged$ = writes.pipe(throttleTime(1000, asyncScheduler, { leading: false, trailing: true }), share())
