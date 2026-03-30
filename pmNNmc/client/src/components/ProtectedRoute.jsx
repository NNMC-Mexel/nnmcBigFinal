import React, { useState } from "react";
import { isAuthenticated, getCurrentUser } from "../api/auth";
import Login from "./Login";

export default function ProtectedRoute({ children }) {
    const [authenticated, setAuthenticated] = useState(isAuthenticated());
    const [user, setUser] = useState(getCurrentUser());

    const handleLoginSuccess = () => {
        setAuthenticated(true);
        setUser(getCurrentUser());
    };

    if (!authenticated) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    return <>{children}</>;
}
