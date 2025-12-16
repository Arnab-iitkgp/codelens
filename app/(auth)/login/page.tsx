import React from 'react'
import LoginUI from '@/module/auth/components/loginUI'
import { requireUnAuth } from '@/module/auth/utils/auth-utils'
const LoginPage = async () => {
    await requireUnAuth();
  return (
    <div>
        <LoginUI/>
    </div>
  )
}

export default LoginPage