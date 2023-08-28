const express = require('express');
import { Request, Response, NextFunction } from 'express';
const bodyParser = require('body-parser');
const knex = require('knex')(require('./knexfile').development);
import jwt from 'jsonwebtoken';
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const cryptolib = require('crypto');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());


// Twilio client
const client = require('twilio')(process.env.accountSid, process.env.authToken);

// Create a transport object for nodemailer
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.senderEmail,
        pass: process.env.senderAppPassword,
    },
});

// Generate a random secret key of 64 bytes (512 bits) - JWT secret key
const jwtSecret = cryptolib.randomBytes(64).toString('hex');
console.log('JWT Secret Key:', jwtSecret);

// Generate a random 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
}

//test
app.get('/', (req: Request, res: Response) => {
    console.log('ok ...');
    return res.json({ message: "ok" });
});


// Sign up route
app.post('/signup', async (req: Request, res: Response) => {
    try {
        const { mail, ph_no, first_name, last_name } = req.body;

        // Check if the user already exists
        const existingUser = await knex('users').where({ mail }).orWhere({ ph_no }).first();
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email / phone number already exists' });
        }

        // Set verified to false
        let emailVerified: boolean = false
        let phoneVerified: boolean = false

        // Generate OTPs
        const emailOTP: number = generateOTP();
        const phoneOTP: number = generateOTP();
        console.log(emailOTP, phoneOTP)

        // Insert user data into the database
        const userId = await knex('users').insert({ mail, ph_no, first_name, last_name, emailOTP, phoneOTP, emailVerified, phoneVerified });


        // Read the email template
        const templatePath = path.join(__dirname, 'welcome.ejs');
        const template = fs.readFileSync(templatePath, 'utf-8');

        // Generate HTML content from the template
        let user_name = first_name + ' ' + last_name
        const htmlContent = ejs.render(template, { user_name, emailOTP });

        // Send welcome email with OTP
        const mailOptions = {
            from: process.env.senderEmail,
            to: mail,
            subject: 'Welcome to Our App!',
            html: htmlContent,
            // text: `Your email verification OTP: ${emailOTP}`
        };

        // Send mail
        await transporter.sendMail(mailOptions);


        // Twilio create message
        client.messages
            .create({
                body: `Your phone verification OTP: ${phoneOTP}`,
                from: '+18159402645', // Your Twilio phone number
                to: `+91${ph_no}`,
            })
            .then((message: any) => console.log(`Message sent with SID: ${message.sid}`))
            .catch((error: Error) => console.error('Error sending message:', error));


        // Generate JWT token
        // const token = jwt.sign({ userId }, jwtSecret, { expiresIn: '1h' });
        // console.log('token:', token)


        return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});


// Email and phone verification route
app.post('/verify', async (req: Request, res: Response) => {
    try {
        const { userId, emailOTP, phoneOTP } = req.body;
        console.log(userId, emailOTP, phoneOTP)

        // Retrieve user data from the database
        const user = await knex('users').where({ id: userId }).first();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check email and phone OTPs
        if (emailOTP !== user.emailOTP || phoneOTP !== user.phoneOTP) {
            return res.status(400).json({ message: 'Invalid OTPs' });
        }

        // Mark email and phone as verified
        await knex('users').where({ id: userId }).update({ emailVerified: true, phoneVerified: true });

        return res.status(200).json({ message: 'Email and phone verified successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});


// Login route
app.post('/login', async (req: Request, res: Response) => {
    try {
        const { mail, ph_no } = req.body;
        console.log(mail, ph_no)

        // Check if the user exists
        const user = await knex('users').where({ mail, ph_no }).first();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if email and phone are verified
        if (!user.emailVerified || !user.phoneVerified) {
            return res.status(403).json({ message: 'Email or phone number not verified' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '1h' });

        return res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});


// Perform READ
app.get('/users', verifyToken, async (req: Request, res: Response) => {
    try {
        if (req.token) {
            let verifyErr = 0

            jwt.verify(req.token, jwtSecret, (err: jwt.JsonWebTokenError | null) => {
                if (err) {
                    verifyErr = 1
                }
            });

            if (verifyErr) {
                return res.status(403).json({ error: 'Forbidden: Failed to read' });
            } else {
                const users = await knex.select().from('users');
                console.log(users);
                return res.status(200).json(users);
            }

        } else {
            return res.status(403).json({ error: 'Forbidden: Failed to read' });
        }

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal server error: Failed to read' });
    }
});


// Perform UPDATE
app.put('/users/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        if (req.token) {
            let verifyErr = 0

            jwt.verify(req.token, jwtSecret, (err: jwt.JsonWebTokenError | null) => {
                if (err) {
                    verifyErr = 1
                }
            });

            if (verifyErr) {
                return res.status(403).json({ error: 'Forbidden: Failed to read' });
            } else {
                const { id } = req.params;
                const { first_name, last_name } = req.body;
                console.log(id, first_name, last_name)
                const updatedVal = await knex('users').where('id', id).update({ first_name, last_name });
                if (!updatedVal) {
                    return res.status(404).json({ message: 'User not found' });
                }
                return res.status(200).json({ message: 'User updated' });
            }

        } else {
            return res.status(403).json({ error: 'Forbidden: Failed to read' });
        }

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal server error: Failed to update' });
    }
});


// Perform DELETE
app.delete('/users/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        if (req.token) {
            let verifyErr = 0

            jwt.verify(req.token, jwtSecret, (err: jwt.JsonWebTokenError | null) => {
                if (err) {
                    verifyErr = 1
                }
            });

            if (verifyErr) {
                return res.status(403).json({ error: 'Forbidden: Failed to read' });
            } else {
                const { id } = req.params;
                const isDeleted = await knex('users').where('id', id).del();
                if (!isDeleted) {
                    return res.status(404).json({ message: 'User not found' });
                }
                return res.status(200).json({ message: 'User deleted' });
            }
        } else {
            return res.status(403).json({ error: 'Forbidden: Failed to read' });
        }

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal server error: Failed to delete' });
    }
});


// Verify user using JWT
function verifyToken(req: Request, res: Response, next: NextFunction) {
    const bearerHeader = req.headers['authorization']

    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ')[1]
        req.token = bearerToken
        next()
    } else {
        res.status(403).json({ error: 'Forbidden: Failed to read' });
    }
}


// Listen on port
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
