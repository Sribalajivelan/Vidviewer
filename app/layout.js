import './globals.css';

export const metadata = {
  title: 'VidViewer',
  description: 'Browse and play videos/images from local folders or your phone over FTP.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
