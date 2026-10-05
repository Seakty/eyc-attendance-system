const ExcelJS = require('exceljs');

/**
 * Generate Excel Workbook for Monthly Attendance Report
 * @param {Array} data - List of teacher attendance summaries
 * @returns {Promise<ExcelJS.Workbook>}
 */
exports.generateAttendanceReport = async (data) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Monthly Attendance');

  // Format Columns
  worksheet.columns = [
    { header: 'Teacher Name', key: 'teacherName', width: 25 },
    { header: 'Total Days Present', key: 'daysPresent', width: 20 },
    { header: 'Days Late', key: 'daysLate', width: 15 },
    { header: 'Days Absent', key: 'daysAbsent', width: 15 },
    { header: 'Strike Count', key: 'strikeCount', width: 15 }
  ];

  // Make Header Row Bold
  worksheet.getRow(1).font = { bold: true };

  // Add Rows Data
  data.forEach(item => {
    worksheet.addRow({
      teacherName: item.full_name || item.teacherName,
      daysPresent: item.days_present || 0,
      daysLate: item.days_late || 0,
      daysAbsent: item.days_absent || 0,
      strikeCount: item.strike_count || 0
    });
  });

  return workbook;
};
