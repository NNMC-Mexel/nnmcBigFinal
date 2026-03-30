import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

export const login = async (identifier, password) => {
    try {
        const response = await axios.post(`${API_URL}/auth/local`, {
            identifier,
            password,
        });

        if (response.data.jwt) {
            localStorage.setItem("token", response.data.jwt);
            localStorage.setItem("user", JSON.stringify(response.data.user));
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const register = async (username, email, password) => {
    try {
        const response = await axios.post(`${API_URL}/auth/local/register`, {
            username,
            email,
            password,
        });

        if (response.data.jwt) {
            localStorage.setItem("token", response.data.jwt);
            localStorage.setItem("user", JSON.stringify(response.data.user));
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
};

export const getCurrentUser = () => {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
};

export const getToken = () => {
    return localStorage.getItem("token");
};

export const isAuthenticated = () => {
    return !!getToken();
};

export const getUserFullName = () => {
    const user = getCurrentUser();
    return user?.fullName || "";
};

export const getMe = async () => {
    const token = getToken();
    const response = await fetch(
        `${API_URL}/users/me?populate=department`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.json();
};

export const updateUserProfile = async (fullName) => {
    const token = getToken();
    const user = getCurrentUser();

    try {
        const response = await axios.put(
            `${API_URL}/users/${user.id}`,
            { fullName },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        const updatedUser = { ...user, fullName };
        localStorage.setItem("user", JSON.stringify(updatedUser));

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};
