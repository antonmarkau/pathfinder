export function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>Pathfinder</h1>
      </header>
      <main className="stage">
        <section className="map" aria-label="Map">
          <p className="map-label">Map</p>
        </section>
        <aside className="toolbar" aria-label="Stops">
          <h2>Stops</h2>
          <p>Addresses you add will be listed here.</p>
        </aside>
      </main>
    </div>
  );
}
