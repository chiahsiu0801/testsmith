import { useState } from 'react';
import { format } from './utils/format';
import { Button } from './components/Button';
import { Card } from './components/Card';

export function App() {
  const [label] = useState(format('app'));
  return (
    <main>
      <Button label={label} />
      <Card />
    </main>
  );
}
