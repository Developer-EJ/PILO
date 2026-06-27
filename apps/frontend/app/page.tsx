export default function Home() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">PILO DEV</p>
        <h1>AI 기반 프로젝트 협업 플랫폼</h1>
        <p className="summary">
          프론트엔드 배포 파이프라인 검증을 위한 초기 화면입니다.
        </p>
        <div className="status">
          <span className="dot" />
          CloudFront + S3 static hosting ready
        </div>
      </section>
    </main>
  );
}
