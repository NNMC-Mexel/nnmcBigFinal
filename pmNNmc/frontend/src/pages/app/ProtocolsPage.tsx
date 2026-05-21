import { Routes, Route } from 'react-router-dom';
import ProtocolsList from '../../modules/protocols/pages/ProtocolsList';
import ProtocolForm from '../../modules/protocols/pages/ProtocolForm';
import ProtocolView from '../../modules/protocols/pages/ProtocolView';

export default function ProtocolsPage() {
  return (
    <Routes>
      <Route index element={<ProtocolsList />} />
      <Route path="new" element={<ProtocolForm />} />
      <Route path=":id" element={<ProtocolView />} />
      <Route path=":id/edit" element={<ProtocolForm />} />
    </Routes>
  );
}
