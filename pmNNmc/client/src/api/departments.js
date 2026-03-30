import axios from "axios";
import { getToken } from "./auth";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

export const getDepartments = async () => {
    const token = getToken();
    const response = await axios.get(`${API_URL}/departments?sort=name`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.data;
};
