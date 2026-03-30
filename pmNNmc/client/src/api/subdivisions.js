import axios from "axios";
import { getToken } from "./auth";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

// Get subdivisions, optionally filtered by department ID
export const getSubdivisions = async (departmentId = null) => {
    const token = getToken();
    const filter = departmentId
        ? `&filters[department][id][$eq]=${departmentId}`
        : "";
    const response = await axios.get(
        `${API_URL}/subdivisions?sort=name${filter}&populate=department&pagination[pageSize]=100`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.data;
};
