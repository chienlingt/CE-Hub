import { useAuth } from '../../../../contexts/AuthContext';
import { adminSessionHeaders } from '../../../../utils/adminSessionHeaders';

/**
 * Block-offs are changed only with an Admin login session: the write routes
 * are behind requireReviewAdmin. Everyone else sees Fleet Availability read-only.
 * Outside an AuthProvider (tests) it is editable, as in SchedulerSettings.
 */
export default function useFleetAdmin() {
  const auth = useAuth();
  if (!auth) return true;
  const role = auth.employeeData?.role;
  const roleName = String((typeof role === 'object' ? role?.name : role) ?? '').trim().toLowerCase();
  return roleName === 'admin' && Boolean(adminSessionHeaders().Authorization);
}
