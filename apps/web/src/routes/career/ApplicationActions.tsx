import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@vitae/ui';
import { NodeFormDialog } from '../../features/forms/NodeFormDialog.js';

export function NewApplicationButton({ label = 'Add application' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Button variant="primary" glyph="plus" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <NodeFormDialog
          open
          onOpenChange={setOpen}
          type="application"
          onSaved={(id) => navigate(`/career/applications/${id}`)}
        />
      ) : null}
    </>
  );
}

export function EditApplicationButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" glyph="adjust" onClick={() => setOpen(true)}>
        Edit application
      </Button>
      {open ? <NodeFormDialog open onOpenChange={setOpen} type="application" nodeId={id} /> : null}
    </>
  );
}
