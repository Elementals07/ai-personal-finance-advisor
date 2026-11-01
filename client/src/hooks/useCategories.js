import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import toast from 'react-hot-toast';

export const useCategories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await API.get('/categories');
            setCategories(res.data.data);
        } catch (error) {
            console.error('Failed to load categories', error);
            // Fallback to minimal defaults in case of network error
            setCategories([{ name: 'Others', color: '#64748b', id: 0 }]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const addCategory = async (name, color) => {
        try {
            const res = await API.post('/categories', { name, color });
            setCategories([...categories, res.data.data]);
            toast.success('Category added successfully');
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add category');
            return false;
        }
    };

    const deleteCategory = async (id) => {
        try {
            await API.delete(`/categories/${id}`);
            setCategories(categories.filter(c => c.id !== id));
            toast.success('Category deleted');
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || 'Cannot delete global categories');
            return false;
        }
    };

    const updateCategory = async (id, color) => {
        try {
            await API.put(`/categories/${id}`, { color });
            setCategories(categories.map(c => c.id === id ? { ...c, color } : c));
            toast.success('Color updated');
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update category');
            return false;
        }
    };

    // Helper map for quick color lookups
    const colorMap = categories.reduce((map, cat) => {
        map[cat.name] = cat.color;
        return map;
    }, {});

    return {
        categories,
        categoryNames: categories.map(c => c.name),
        colorMap,
        loading,
        fetchCategories,
        addCategory,
        deleteCategory,
        updateCategory
    };
};
