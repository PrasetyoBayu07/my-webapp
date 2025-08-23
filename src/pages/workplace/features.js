import Link from "next/link";

export default function Features() {
  return (
    <div className="features">
      <h2>Pilih Fitur</h2>

      <div className="feature-list">
        <Link href="/workplace/photos" className="feature-card">
          <img src="/icons/photo.svg" alt="Photos" />
          <h3>Smart Photos</h3>
          <p>Edit foto modern dengan AI</p>
        </Link>

        <Link href="/workplace/videos" className="feature-card">
          <img src="/icons/video.svg" alt="Videos" />
          <h3>Smart Videos</h3>
          <p>Edit video cepat dengan AI</p>
        </Link>
      </div>
    </div>
  );
}
