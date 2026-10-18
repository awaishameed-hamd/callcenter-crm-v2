import { redirect } from 'next/navigation'

// "/" has no screen of its own. The session token lives in sessionStorage, which
// the server cannot read, so AppLayout (client side) decides where a signed-in user goes.
export default function RootPage() {
  redirect('/login')
}
