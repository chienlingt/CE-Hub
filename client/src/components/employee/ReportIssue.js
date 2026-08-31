import React, { useState, useEffect } from 'react';
import { AlertCircle, Send, CheckCircle, Clock, FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../common/Modal';

import { API_BASE_URL } from '../../utils/apiBaseUrl';

// A report can only be edited/deleted by its author while admin hasn't acted on it yet;
// once marked resolved it's part of the admin record and shouldn't be altered client-side.
const isEditable = (report) => (report.status || 'pending').toLowerCase() === 'pending';

export default function ReportIssue() {
  const { employeeData } = useAuth();
  const [content, setContent] = useState('');
  const [myReports, setMyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Fetch only the current employee's reports
  useEffect(() => {
    if (!employeeData?.id) return;

    const fetchMyReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/reports/employee/${employeeData.id}`);
        if (!response.ok) throw new Error('Failed to fetch reports');
        const data = await response.json();
        setMyReports(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching reports:', err);
        setError('Failed to load your reports');
      } finally {
        setLoading(false);
      }
    };

    fetchMyReports();
  }, [employeeData?.id]);

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      setSubmitError('Please enter a description of the issue');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage('');

    const isEditing = !!editingReportId;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/reports${isEditing ? `/${editingReportId}` : ''}`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isEditing
              ? { content: content.trim() }
              : {
                  employee_id: employeeData.id,
                  content: content.trim(),
                  status: 'pending',
                  created_at: new Date().toISOString()
                }
          )
        }
      );

      if (!response.ok) throw new Error(isEditing ? 'Failed to update report' : 'Failed to submit report');

      const savedReport = await response.json();
      setMyReports(
        isEditing
          ? myReports.map((r) => (r.id === savedReport.id ? savedReport : r))
          : [savedReport, ...myReports]
      );
      setContent('');
      setEditingReportId(null);
      setIsModalOpen(false);
      showSuccess(isEditing ? 'Your report has been updated successfully!' : 'Your report has been submitted successfully!');
    } catch (err) {
      console.error('Error saving report:', err);
      setSubmitError(isEditing ? 'Failed to update your report. Please try again.' : 'Failed to submit your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenNewReport = () => {
    setEditingReportId(null);
    setContent('');
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (report) => {
    setEditingReportId(report.id);
    setContent(report.content || '');
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setContent('');
    setSubmitError(null);
    setEditingReportId(null);
  };

  const handleDelete = async (report) => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return;

    setDeletingId(report.id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${report.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete report');

      setMyReports(myReports.filter((r) => r.id !== report.id));
      showSuccess('Report deleted successfully!');
    } catch (err) {
      console.error('Error deleting report:', err);
      setError('Failed to delete the report. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'resolved': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
      default: return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <AlertCircle className="w-8 h-8 mr-3 text-blue-600" />
            Report a System / App Problem
          </h1>
          <p className="mt-2 text-gray-600">
            Report bugs or problems with the CE Hub app itself. Track your submitted reports below.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
            <span className="text-green-800">{successMessage}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Report Form trigger */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Submit New Report</h2>
              <p className="mt-1 text-sm text-gray-500">
                Report a bug or problem with the CE Hub app itself.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenNewReport}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Report
            </button>
          </div>
        </div>

        {/* Report Form popup */}
        <Modal show={isModalOpen} onClose={handleCloseModal} maxWidth="max-w-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {editingReportId ? 'Edit Report' : 'Submit New Report'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                Describe the issue
              </label>
              <textarea
                id="content"
                rows="5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Please provide details about the app problem you're experiencing..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                For delivery problems (failed delivery, road blockage, customer issues), use the driver
                dashboard's Fail Delivery or Report actions instead — those reach the dispatch team directly.
              </p>
            </div>

            {submitError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                <AlertCircle className="w-4 h-4 text-red-600 mr-2 flex-shrink-0" />
                <span className="text-sm text-red-800">{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting
                ? (editingReportId ? 'Saving...' : 'Submitting...')
                : (editingReportId ? 'Save Changes' : 'Submit Report')}
            </button>
          </form>
        </Modal>

        {/* My Reports */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            My Reported Issues
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="mt-2 text-gray-600">Loading your reports...</p>
            </div>
          ) : myReports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">You haven't reported any issues yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myReports.map((report) => (
                <div
                  key={report.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      {getStatusIcon(report.status)}
                      <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                        {report.status || 'pending'}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{report.content}</p>
                  {isEditable(report) && (
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(report)}
                        className="flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(report)}
                        disabled={deletingId === report.id}
                        className="flex items-center text-sm text-gray-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {deletingId === report.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {!loading && myReports.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center">
                <Clock className="w-6 h-6 text-yellow-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {myReports.filter(r => r.status?.toLowerCase() === 'pending').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center">
                <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Resolved</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {myReports.filter(r => r.status?.toLowerCase() === 'resolved').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
