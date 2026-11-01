const Category = require('../models/Category');

const categoryController = {
    async list(req, res, next) {
        try {
            const categories = await Category.findByUserId(req.user.id);
            res.json({ success: true, data: categories });
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const { name, color } = req.body;
            if (!name || !color) {
                return res.status(400).json({ success: false, message: 'Name and color are required' });
            }

            // Capitalize first letter of category for consistency
            const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

            try {
                const newCategory = await Category.create(req.user.id, formattedName, color);
                res.status(201).json({ success: true, data: newCategory });
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Category name already exists' });
                }
                throw err;
            }
        } catch (error) {
            next(error);
        }
    },

    async delete(req, res, next) {
        try {
            const success = await Category.delete(req.params.id, req.user.id);
            if (!success) {
                return res.status(404).json({ success: false, message: 'Category not found or you cannot delete a global default' });
            }
            res.json({ success: true, message: 'Category deleted' });
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { color } = req.body;
            if (!color) {
                return res.status(400).json({ success: false, message: 'Color is required' });
            }

            const success = await Category.update(req.params.id, req.user.id, color);
            if (!success) {
                return res.status(404).json({ success: false, message: 'Category not found or you cannot edit a global default' });
            }
            res.json({ success: true, message: 'Category updated' });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = categoryController;
