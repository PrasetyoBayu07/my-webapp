import Link from "next/link";

export default function Home() {
  return (
    <div className="landing">
      <header className="navbar">
        <h1>My WebApp</h1>
        <nav>
          <Link href="/features">Fitur</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="hero">
        <h2>Selamat datang di WebApp Modern</h2>
        <p>Smart Photos & Smart Videos dengan keamanan premium.</p>
        <Link href="/features" className="cta">Jelajahi Fitur</Link>
      </main>
    </div>
  );
}
