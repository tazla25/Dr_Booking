import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';

const Dashboard = () => <div className="p-8 text-2xl font-bold">Dashboard</div>;
const Doctors = () => <div className="p-8 text-2xl font-bold">Doctors</div>;
const Schedules = () => <div className="p-8 text-2xl font-bold">Schedules</div>;
const Appointments = () => <div className="p-8 text-2xl font-bold">Appointments</div>;

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Placeholder layout/routing for authenticated routes */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/appointments" element={<Appointments />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
