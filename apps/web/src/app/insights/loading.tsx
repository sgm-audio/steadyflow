export default function InsightsLoading() {
  return (
    <div style={{ padding: '2rem' }}>
      <div
        style={{
          height: '1.5rem',
          width: '8rem',
          background: '#18181b',
          borderRadius: '0.25rem',
          marginBottom: '2rem',
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: '5rem',
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}
        />
      ))}
    </div>
  );
}
