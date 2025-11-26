const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET /api/settings/:key
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await prisma.system_settings.findUnique({
      where: { setting_key: key }
    });

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({
      success: true,
      data: {
        key: setting.setting_key,
        value: setting.setting_value,
        description: setting.description
      }
    });
  } catch (err) {
    console.error('GET /api/settings/:key error', err);
    res.status(500).json({ error: 'Failed to fetch setting', details: err.message });
  }
});

// GET /api/settings - Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await prisma.system_settings.findMany();

    res.json({
      success: true,
      data: settings.map(s => ({
        key: s.setting_key,
        value: s.setting_value,
        description: s.description
      }))
    });
  } catch (err) {
    console.error('GET /api/settings error', err);
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

// PUT /api/settings/:key - Update setting (admin only)
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Setting value is required' });
    }

    // Check if setting exists
    const existingSetting = await prisma.system_settings.findUnique({
      where: { setting_key: key }
    });

    if (!existingSetting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Update setting
    const updatedSetting = await prisma.system_settings.update({
      where: { setting_key: key },
      data: {
        setting_value: value.toString(),
        updated_at: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        key: updatedSetting.setting_key,
        value: updatedSetting.setting_value,
        description: updatedSetting.description
      }
    });
  } catch (err) {
    console.error('PUT /api/settings/:key error', err);
    res.status(500).json({ error: 'Failed to update setting', details: err.message });
  }
});

module.exports = router;
