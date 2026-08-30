export default function KeysLoading() {
  return (
    <div style={{ padding: '2rem' }}>
      <div
        style={{
          height: '1.5rem',
          width: '10rem',
          background: '#18181b',
          borderRadius: '0.25rem',
          marginBottom: '2rem',
        }}
      />
      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 600 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: '3.5rem',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '0.5rem',
            }}
          />
        ))}
      </div>
    </div>
  );
}
