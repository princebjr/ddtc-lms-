import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { InAppBrowserNotice } from '@/components/feedback/InAppBrowserNotice.jsx';
import { NetworkStatus } from '@/components/feedback/NetworkStatus.jsx';
import { ToastProvider } from '@/components/feedback/ToastProvider.jsx';
import { UpdatePrompt } from '@/components/feedback/UpdatePrompt.jsx';
import { ThemeProvider } from '@/components/theme/ThemeProvider.jsx';
import { createAppRouter } from '@/router.jsx';

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <ThemeProvider>
      <ToastProvider>
        <NetworkStatus />
        <UpdatePrompt />
        <InAppBrowserNotice />
        <RouterProvider router={router} />
      </ToastProvider>
    </ThemeProvider>
  );
}
