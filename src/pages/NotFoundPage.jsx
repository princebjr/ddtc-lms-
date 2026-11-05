import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/feedback/States.jsx';
import { buttonVariants } from '@/components/ui/button.jsx';

export default function NotFoundPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh-screen w-full max-w-reading flex-col justify-center px-4 py-12 pt-safe pb-safe">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={Compass}
        title="This page does not exist"
        description="The link may be old or mistyped. Go back to the start page."
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            Go to the start page
          </Link>
        }
      />
    </main>
  );
}
